#!/usr/bin/env python
"""Run deterministic warnings against Parkinglot Markdown content."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import unquote


REQUIRED_ENTRY_FIELDS = (
    "Status",
    "Type",
    "Owner",
    "Closest human",
    "Source/date",
    "Sensitivity",
    "Confidence",
    "Last updated",
)

VALID_FIELD_VALUES = {
    "Status": {
        "Idea",
        "Research",
        "Planning",
        "Active",
        "Waiting",
        "Blocked",
        "Ready to graduate",
        "Graduated",
        "Closed",
    },
    "Type": {
        "Idea",
        "Research note",
        "Project note",
        "Engineering issue",
        "Decision candidate",
        "Customer input",
        "Validation result",
        "Process draft",
    },
    "Sensitivity": {"Level 1", "Level 2", "Level 3", "Level 4 pointer only"},
    "Confidence": {"Confirmed", "Likely", "Assumption", "Open question", "Conflict"},
}

READINESS_TERMS = (
    "approved",
    "compliant",
    "final",
    "guaranteed",
    "release ready",
    "released",
)

RAW_CHAT_MARKERS = (
    "<system-reminder",
    "<task-notification",
)


@dataclass
class Finding:
    severity: str
    code: str
    path: str
    message: str


def markdown_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target] if target.suffix.lower() == ".md" else []
    return sorted(path for path in target.rglob("*.md") if ".git" not in path.parts)


def add(findings: list[Finding], severity: str, code: str, path: Path, message: str) -> None:
    findings.append(Finding(severity, code, str(path), message))


def normalized_link_target(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("<") and raw.endswith(">"):
        return raw[1:-1].strip()
    return raw.split()[0].strip("<>")


def check_links(path: Path, text: str, findings: list[Finding]) -> None:
    targets = [match.group(1) for match in re.finditer(r"\[!\[[^\]]*\]\([^)]+\)\]\(([^)]+)\)", text)]
    text_without_wrapped_images = re.sub(r"\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)", "", text)
    targets.extend(match.group(1) for match in re.finditer(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", text_without_wrapped_images))
    for target in targets:
        raw = normalized_link_target(target)
        if not raw or raw.startswith(("#", "http://", "https://", "mailto:", "tel:")):
            continue
        link_path = unquote(raw.split("#", 1)[0])
        if not link_path:
            continue
        resolved = (path.parent / link_path).resolve()
        if not resolved.exists():
            add(findings, "ERROR", "broken-link", path, f"Relative link does not resolve: {raw}")


def check_mermaid(path: Path, text: str, findings: list[Finding]) -> None:
    for index, block in enumerate(re.findall(r"```mermaid\s*(.*?)```", text, re.DOTALL | re.IGNORECASE), 1):
        if not block.strip():
            add(findings, "ERROR", "empty-mermaid", path, f"Mermaid block {index} is empty")
        if re.search(r"\bclick\s+\S+\s+[\"']?[^\s\"']+\.md(?:[#\"']|\s|$)", block, re.IGNORECASE):
            add(findings, "WARN", "relative-mermaid-link", path, f"Mermaid block {index} may use a relative Markdown click target")


def field_value(text: str, field: str) -> str | None:
    match = re.search(rf"^\*\*{re.escape(field)}:\*\*[ \t]+(.+?)\s*$", text, re.MULTILINE | re.IGNORECASE)
    return match.group(1).strip() if match else None


def check_file(path: Path, entry_required: bool, findings: list[Finding]) -> None:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        add(findings, "ERROR", "encoding", path, "File is not valid UTF 8")
        return

    lower = text.lower()
    word_count = len(re.findall(r"\b\w+\b", text))
    heading_count = len(re.findall(r"^#{1,6}\s+", text, re.MULTILINE))
    has_any_entry_field = any(re.search(rf"\*\*{re.escape(field)}:\*\*", text, re.IGNORECASE) for field in REQUIRED_ENTRY_FIELDS)

    if entry_required or has_any_entry_field:
        for field in REQUIRED_ENTRY_FIELDS:
            value = field_value(text, field)
            if not value:
                add(findings, "ERROR", "missing-field", path, f"Missing or empty required field: {field}")
        for field, allowed in VALID_FIELD_VALUES.items():
            value = field_value(text, field)
            if value and value not in allowed:
                add(findings, "ERROR", "invalid-field-value", path, f"Invalid {field} value: {value}")
        status = field_value(text, "Status")
        owner = field_value(text, "Owner")
        if status == "Active" and owner and owner.casefold() == "tbd":
            add(findings, "WARN", "active-owner-tbd", path, "Active entry has no named owner")
        if not re.search(r"^##\s+(Evidence|Sources?)\s*$", text, re.MULTILINE | re.IGNORECASE):
            add(findings, "WARN", "missing-evidence", path, "Entry has no Evidence or Sources section")
        if "next action" not in lower:
            add(findings, "WARN", "missing-next-action", path, "Entry does not identify a next action")

    if re.search(r"\b[A-Za-z]:[\\/]", text) or "file:///" in lower:
        add(findings, "ERROR", "local-path", path, "Machine local absolute path detected")

    for marker in RAW_CHAT_MARKERS:
        if marker in lower:
            add(findings, "WARN", "raw-chat", path, f"Possible raw conversation residue: {marker}")
    if re.search(r"^\s*(assistant|human|user):\s", text, re.MULTILINE | re.IGNORECASE):
        add(findings, "WARN", "raw-chat", path, "Possible speaker labeled conversation residue")

    if re.search(r"\b(TODO|FIXME|XXX)\b|\[insert\b", text, re.IGNORECASE):
        add(findings, "WARN", "placeholder", path, "Unresolved placeholder token detected")

    present_terms = sorted(term for term in READINESS_TERMS if re.search(rf"\b{re.escape(term)}\b", lower))
    if present_terms:
        add(findings, "INFO", "readiness-language", path, "Verify authority and evidence for readiness terms: " + ", ".join(present_terms))

    if path.name.lower() == "readme.md" and (word_count > 2500 or heading_count > 18):
        add(
            findings,
            "WARN",
            "large-readme",
            path,
            f"README has {word_count} words and {heading_count} headings; confirm it is a front door rather than a content warehouse",
        )

    check_links(path, text, findings)
    check_mermaid(path, text, findings)


def check_orphans(target: Path, files: list[Path], findings: list[Finding]) -> None:
    if not target.is_dir():
        return
    readmes = [path for path in files if path.name.lower() == "readme.md"]
    if not readmes:
        add(findings, "WARN", "missing-readme", target, "Directory contains Markdown files but no README")
        return
    combined = "\n".join(path.read_text(encoding="utf-8", errors="replace") for path in files).lower()
    for path in files:
        if path.name.lower() == "readme.md":
            continue
        relative = path.relative_to(target).as_posix().lower()
        if relative not in combined and path.name.lower() not in combined:
            add(findings, "WARN", "orphan-markdown", path, "Markdown file is not linked from any README in the audited tree")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit Parkinglot Markdown content")
    parser.add_argument("target", type=Path, help="Markdown file or directory to audit")
    parser.add_argument("--entry", action="store_true", help="Require entry metadata on the target file or root README")
    parser.add_argument("--strict", action="store_true", help="Return failure when warnings are present")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Emit JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target = args.target.resolve()
    if not target.exists():
        print(f"Target does not exist: {target}", file=sys.stderr)
        return 2

    files = markdown_files(target)
    if not files:
        print(f"No Markdown files found: {target}", file=sys.stderr)
        return 2

    findings: list[Finding] = []
    root_readme = target / "README.md" if target.is_dir() else target
    for path in files:
        check_file(path, args.entry and path.resolve() == root_readme.resolve(), findings)
    check_orphans(target, files, findings)

    counts = {severity: sum(item.severity == severity for item in findings) for severity in ("ERROR", "WARN", "INFO")}
    if args.json_output:
        print(json.dumps({"target": str(target), "files": len(files), "counts": counts, "findings": [asdict(item) for item in findings]}, indent=2))
    else:
        print(f"Audited {len(files)} Markdown file(s)")
        for item in findings:
            print(f"{item.severity} {item.code} {item.path}: {item.message}")
        print(f"Summary: {counts['ERROR']} error(s), {counts['WARN']} warning(s), {counts['INFO']} informational finding(s)")

    if counts["ERROR"]:
        return 1
    if args.strict and counts["WARN"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
