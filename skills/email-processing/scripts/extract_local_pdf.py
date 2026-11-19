"""Read a local PDF through installed readers only. No network or installation."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

MAX_BYTES = 25 * 1024 * 1024
MAX_CHARS = 6_000
MAX_CHUNK_CHARS = 12_000
MAX_JSON_CHARS = 16_000


def blocked(reason, **extra):
    return {"status": "blocked", "complete": False, "reason": reason, **extra}


def finish(texts, reader, digest, max_chars, offset=0):
    empty = [i + 1 for i, text in enumerate(texts) if not text.strip()]
    parts = [f"--- Page {i + 1} ---\n{value}" for i, value in enumerate(texts)]
    text = "\n".join(parts)
    if not any(value.strip() for value in texts):
        return blocked("no_extractable_text_use_supported_visual_or_OCR_review",
                       reader=reader, sha256=digest, pages=len(texts))
    if offset > len(text):
        return blocked("offset_out_of_range", sha256=digest, text_chars=len(text))
    boundaries, cursor = [], 0
    for page, part in enumerate(parts, 1):
        boundaries.append((page, cursor, cursor + len(part)))
        cursor += len(part) + 1
    end = min(offset + max_chars, len(text))
    while True:
        complete = offset == 0 and end == len(text) and not empty
        result = {"status": "extracted" if complete else "partial", "complete": complete,
                  "chunk_complete": True, "reader": reader, "sha256": digest, "pages": len(texts),
                  "empty_pages_requiring_visual_check": empty, "truncated": end < len(text),
                  "text_chars": len(text), "offset": offset,
                  "next_offset": end if end < len(text) else None, "eof": end == len(text),
                  "pages_covered": [page for page, start, stop in boundaries if start < end and stop > offset],
                  "text": text[offset:end]}
        excess = len(json.dumps(result, ensure_ascii=False)) - MAX_JSON_CHARS
        if excess <= 0:
            return result
        if end <= offset + 1:
            return blocked("metadata_output_limit", sha256=digest)
        end = offset + max(1, (end - offset) // 2)


def extract(path, *, max_bytes=MAX_BYTES, max_chars=MAX_CHARS, timeout=30,
            offset=0, expected_sha256=None):
    if not 1 <= max_chars <= MAX_CHUNK_CHARS or offset < 0 or not 1 <= timeout <= 120:
        return blocked("invalid_bounds")
    pdf = Path(path).expanduser()
    if not pdf.is_file():
        return blocked("local_file_not_found")
    if pdf.stat().st_size > max_bytes:
        return blocked("input_size_limit", max_bytes=max_bytes)
    with pdf.open("rb") as source:
        signature = source.read(1024)
        if b"%PDF-" not in signature:
            return blocked("not_a_pdf")
        source.seek(0)
        # hashlib.file_digest is Python 3.11+; use bounded streaming for
        # supported existing Python 3.9/3.10 runtimes as well.
        checksum = hashlib.sha256()
        size = 0
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            size += len(chunk)
            if size > max_bytes:
                return blocked("input_size_limit", max_bytes=max_bytes)
            checksum.update(chunk)
        digest = checksum.hexdigest()
    if expected_sha256 is not None and digest != expected_sha256.lower():
        return blocked("source_changed_or_checksum_mismatch", sha256=digest)

    reader = shutil.which("pdftotext")
    if reader:
        try:
            # An argument list keeps spaces and metacharacters in filenames literal.
            result = subprocess.run([reader, "-layout", "-enc", "UTF-8", str(pdf.resolve()), "-"],
                                    capture_output=True, timeout=timeout, check=False)
        except subprocess.TimeoutExpired:
            return blocked("local_reader_timeout", reader="pdftotext", sha256=digest)
        except OSError:
            return blocked("local_reader_unavailable", reader="pdftotext", sha256=digest)
        if result.returncode:
            return blocked("local_reader_failed_or_encrypted", reader="pdftotext",
                           exit_code=result.returncode, sha256=digest)
        try:
            output = result.stdout.decode("utf-8")
        except UnicodeDecodeError:
            return blocked("local_reader_encoding_error", reader="pdftotext", sha256=digest)
        texts = output.split("\f")
        if len(texts) > 1 and not texts[-1].strip():
            texts.pop()  # pdftotext terminates the last page with a form feed.
        return finish(texts, "pdftotext", digest, max_chars, offset)

    # Reuse an installed Python reader, never install one during a customer turn.
    try:
        pypdf = importlib.import_module("pypdf")
    except ImportError:
        return blocked("no_installed_local_reader_pdftotext_or_pypdf_required", sha256=digest)
    try:
        doc = pypdf.PdfReader(str(pdf))
        if doc.is_encrypted:
            return blocked("encrypted_pdf_requires_authorized_readable_copy", reader="pypdf", sha256=digest)
        texts = [page.extract_text() or "" for page in doc.pages]
    except Exception:
        return blocked("local_reader_failed", reader="pypdf", sha256=digest)
    return finish(texts, "pypdf", digest, max_chars, offset)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", help="Existing local PDF; a filename is not a verified PO reference")
    parser.add_argument("--max-chars", type=int, default=MAX_CHARS)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--expected-sha256", help="Reuse the verified first-chunk digest for continuation")
    args = parser.parse_args()
    if not 1 <= args.max_chars <= MAX_CHUNK_CHARS or args.offset < 0 or not 1 <= args.timeout <= 120:
        parser.error("max-chars must be 1..12000; offset >= 0; timeout 1..120 seconds")
    if args.offset and not args.expected_sha256:
        parser.error("continuation requires --expected-sha256 from the first chunk")
    if args.expected_sha256 and (len(args.expected_sha256) != 64 or any(c not in '0123456789abcdefABCDEF' for c in args.expected_sha256)):
        parser.error("expected-sha256 must be a full 64-character hexadecimal digest")
    try:
        result = extract(args.pdf, max_chars=args.max_chars, timeout=args.timeout,
                         offset=args.offset, expected_sha256=args.expected_sha256)
    except OSError:
        result = blocked("local_file_access_failed")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    # A usable partial chunk is not a command failure. Continue by offset/digest.
    return 2 if result["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
