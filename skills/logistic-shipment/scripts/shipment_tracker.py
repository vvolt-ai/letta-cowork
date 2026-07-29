#!/usr/bin/env python3
"""Shipment Tracker API helper for Letta Code skills.

Reads the API token from SHIPMENT_TRACKER_TOKEN, with SHIPMENT_TRACKER_TOKEN_NEW as a temporary fallback; does not store new tokens locally.
Uses only Python standard library.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import stat
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE_URL = "https://logistics-tracker.ngrok.app/api"
CONFIG_DIR = Path.home() / ".config" / "letta-shipment-tracker"
CONFIG_FILE = CONFIG_DIR / "config.json"

ENTITY_PATHS = {
    "records": "records",
    "shipments": "records",
    "references": "references",
    "anchors": "references",
    "steps": "steps",
    "process-steps": "steps",
    "tracking": "tracking",
    "customs": "customs",
    "closeout": "closeout",
    "documents": "documents",
    "parties": "parties",
    "exceptions": "exceptions",
    "actions": "actions",
    "problem-types": "problem-types",
    "problem_types": "problem-types",
    "products": "products",
    "payloads": "payloads",
    "templates": "templates",
    "template-steps": "template-steps",
}


def load_config() -> dict[str, Any]:
    if not CONFIG_FILE.exists():
        return {}
    try:
        return json.loads(CONFIG_FILE.read_text())
    except json.JSONDecodeError:
        return {}


def save_config(config: dict[str, Any]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2, sort_keys=True))
    os.chmod(CONFIG_FILE, stat.S_IRUSR | stat.S_IWUSR)


def get_base_url(args: argparse.Namespace) -> str:
    requested = (args.base_url or DEFAULT_BASE_URL).rstrip("/")
    if requested != DEFAULT_BASE_URL:
        raise SystemExit(
            f"Unsupported Shipment Tracker base URL: {requested}. Use only {DEFAULT_BASE_URL}."
        )
    return requested


def get_token(args: argparse.Namespace) -> str:
    if args.token:
        return args.token
    env_token = os.environ.get("SHIPMENT_TRACKER_TOKEN")
    if env_token:
        return env_token
    env_token_new = os.environ.get("SHIPMENT_TRACKER_TOKEN_NEW")
    if env_token_new:
        return env_token_new
    raise SystemExit(
        "No token found. Configure SHIPMENT_TRACKER_TOKEN as a Letta secret or environment variable. "
        "Do NOT paste the token into chat."
    )


def parse_json_arg(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON for --data: {exc}") from exc
    if not isinstance(parsed, dict):
        raise SystemExit("--data must be a JSON object")
    return parsed


def entity_path(entity: str) -> str:
    key = entity.strip().lower()
    if key not in ENTITY_PATHS:
        valid = ", ".join(sorted(ENTITY_PATHS))
        raise SystemExit(f"Unknown entity '{entity}'. Valid entities: {valid}")
    return ENTITY_PATHS[key]


def build_url(base_url: str, path: str, params: dict[str, Any] | None = None) -> str:
    url = f"{base_url}/{path.lstrip('/')}"
    if params:
        clean = {k: v for k, v in params.items() if v not in (None, "")}
        if clean:
            url += "?" + urllib.parse.urlencode(clean, doseq=True)
    return url


def get_ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def request(args: argparse.Namespace, method: str, path: str, data: dict[str, Any] | None = None,
            params: dict[str, Any] | None = None) -> Any:
    base_url = get_base_url(args)
    token = get_token(args)
    url = build_url(base_url, path, params)
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, method=method.upper())
    req.add_header("Authorization", f"Token {token}")
    req.add_header("Accept", "application/json")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "Letta-Code-Shipment-Tracker/1.0")
    agent_name = getattr(args, "agent_name", None) or load_config().get("agent_name") or "Letta Code"
    req.add_header("X-Agent-Name", agent_name)
    try:
        with urllib.request.urlopen(req, timeout=args.timeout, context=get_ssl_context()) as response:
            text = response.read().decode("utf-8")
            if not text:
                return {"ok": True, "status": response.status}
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return text
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        try:
            details = json.loads(text)
        except json.JSONDecodeError:
            details = text
        return {"ok": False, "status": exc.code, "reason": exc.reason, "details": details, "url": url}
    except urllib.error.URLError as exc:
        return {"ok": False, "error": "connection_failed", "details": str(exc.reason), "url": url}


def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=False))


def cmd_auth(args: argparse.Namespace) -> None:
    config = load_config()
    if args.auth_action == "set-token":
        raise SystemExit(
            "This skill does not store new tokens locally. Configure SHIPMENT_TRACKER_TOKEN as a Letta secret instead."
        )
    elif args.auth_action == "set-agent-name":
        if not args.value:
            raise SystemExit("Provide an agent name, for example: auth set-agent-name Vega")
        config["agent_name"] = args.value
        save_config(config)
        print_json({"ok": True, "agent_name": args.value})
    elif args.auth_action == "status":
        source = "SHIPMENT_TRACKER_TOKEN" if os.environ.get("SHIPMENT_TRACKER_TOKEN") else ("SHIPMENT_TRACKER_TOKEN_NEW" if os.environ.get("SHIPMENT_TRACKER_TOKEN_NEW") else None)
        print_json({
            "token_source": source,
            "has_token": bool(source),
            "base_url": get_base_url(args),
            "agent_name": config.get("agent_name", "Letta Code"),
        })
    elif args.auth_action == "clear-token":
        config.pop("token", None)
        config.pop("base_url", None)
        save_config(config)
        print("Removed legacy local token/base_url config if present. Letta secrets are unchanged.")


def cmd_request(args: argparse.Namespace) -> None:
    data = parse_json_arg(args.data)
    params = dict(param.split("=", 1) for param in args.param or [])
    print_json(request(args, args.method, args.path, data if args.data else None, params))


def cmd_list(args: argparse.Namespace) -> None:
    params: dict[str, Any] = {}
    if args.shipment:
        params["shipment"] = args.shipment
    print_json(request(args, "GET", f"{entity_path(args.entity)}/", params=params))


def cmd_get(args: argparse.Namespace) -> None:
    print_json(request(args, "GET", f"{entity_path(args.entity)}/{args.id}/"))


def cmd_create(args: argparse.Namespace) -> None:
    print_json(request(args, "POST", f"{entity_path(args.entity)}/", parse_json_arg(args.data)))


def cmd_update(args: argparse.Namespace) -> None:
    print_json(request(args, "PATCH", f"{entity_path(args.entity)}/{args.id}/", parse_json_arg(args.data)))


def cmd_delete(args: argparse.Namespace) -> None:
    print_json(request(args, "DELETE", f"{entity_path(args.entity)}/{args.id}/"))


def cmd_search(args: argparse.Namespace) -> None:
    print_json(request(args, "GET", "records/search/", params={"q": args.query}))


def cmd_timeline(args: argparse.Namespace) -> None:
    print_json(request(args, "GET", f"records/{args.shipment_id}/timeline/"))


def cmd_note(args: argparse.Namespace) -> None:
    print_json(request(args, "POST", f"records/{args.shipment_id}/notes/", {"note": args.note}))


def cmd_close(args: argparse.Namespace) -> None:
    action = "close" if args.reopen is False else "reopen"
    print_json(request(args, "POST", f"records/{args.shipment_id}/{action}/", {}))


def cmd_issues(args: argparse.Namespace) -> None:
    print_json(request(args, "GET", f"issues/{args.issue_type}/"))


def cmd_apply_template(args: argparse.Namespace) -> None:
    print_json(request(args, "POST", f"templates/{args.template_id}/apply-to/{args.shipment_id}/", {}))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Call the hosted Shipment Tracker REST API")
    parser.add_argument("--base-url", help=f"API base URL. Default: {DEFAULT_BASE_URL}")
    parser.add_argument("--token", help="API token override for controlled non-chat use. Prefer SHIPMENT_TRACKER_TOKEN secret.")
    parser.add_argument("--agent-name", help="X-Agent-Name audit header value")
    parser.add_argument("--timeout", type=int, default=30)
    sub = parser.add_subparsers(dest="command", required=True)

    auth = sub.add_parser("auth", help="Check token secret status, set agent name, or clear legacy local config")
    auth.add_argument("auth_action", choices=["set-token", "set-agent-name", "status", "clear-token"])
    auth.add_argument("value", nargs="?", help="Agent name for set-agent-name. Tokens are not stored by this helper.")
    auth.set_defaults(func=cmd_auth)

    raw = sub.add_parser("request", help="Raw API request for advanced endpoints")
    raw.add_argument("method", choices=["GET", "POST", "PUT", "PATCH", "DELETE"])
    raw.add_argument("path", help="Path relative to /api, for example records/1/")
    raw.add_argument("--data", help="JSON object request body")
    raw.add_argument("--param", action="append", help="Query parameter as key=value. Repeatable.")
    raw.set_defaults(func=cmd_request)

    list_cmd = sub.add_parser("list", help="List records for an entity")
    list_cmd.add_argument("entity")
    list_cmd.add_argument("--shipment", help="Filter child entities by shipment ID")
    list_cmd.set_defaults(func=cmd_list)

    get = sub.add_parser("get", help="Get one entity by ID")
    get.add_argument("entity")
    get.add_argument("id")
    get.set_defaults(func=cmd_get)

    create = sub.add_parser("create", help="Create an entity from JSON")
    create.add_argument("entity")
    create.add_argument("--data", required=True, help="JSON object body")
    create.set_defaults(func=cmd_create)

    update = sub.add_parser("update", help="Patch an entity from JSON")
    update.add_argument("entity")
    update.add_argument("id")
    update.add_argument("--data", required=True, help="JSON object body")
    update.set_defaults(func=cmd_update)

    delete = sub.add_parser("delete", help="Delete an entity by ID")
    delete.add_argument("entity")
    delete.add_argument("id")
    delete.set_defaults(func=cmd_delete)

    search = sub.add_parser("search", help="Search shipments")
    search.add_argument("query")
    search.set_defaults(func=cmd_search)

    timeline = sub.add_parser("timeline", help="Get shipment process timeline")
    timeline.add_argument("shipment_id")
    timeline.set_defaults(func=cmd_timeline)

    note = sub.add_parser("note", help="Add an activity note to a shipment")
    note.add_argument("shipment_id")
    note.add_argument("note")
    note.set_defaults(func=cmd_note)

    close = sub.add_parser("close", help="Close a shipment")
    close.add_argument("shipment_id")
    close.set_defaults(func=cmd_close, reopen=False)

    reopen = sub.add_parser("reopen", help="Reopen a shipment")
    reopen.add_argument("shipment_id")
    reopen.set_defaults(func=cmd_close, reopen=True)

    issues = sub.add_parser("issues", help="Get operational issue lists")
    issues.add_argument("issue_type", choices=["overdue", "shipping", "customs", "receiving", "closeout"])
    issues.set_defaults(func=cmd_issues)

    apply_template = sub.add_parser("apply-template", help="Apply a process template to a shipment")
    apply_template.add_argument("template_id")
    apply_template.add_argument("shipment_id")
    apply_template.set_defaults(func=cmd_apply_template)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
