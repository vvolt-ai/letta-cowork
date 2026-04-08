#!/usr/bin/env python3
import json
import queue
import re
import sys
import threading
import time
import requests

BASE_URL = "https://prod-veraai-mcp.ngrok.app"
MCP_URL = BASE_URL + "/mcp"


def open_sse_and_get_endpoint():
    resp = requests.get(MCP_URL, headers={"Accept": "text/event-stream"}, stream=True, timeout=(10, 30))
    resp.raise_for_status()
    first = next(resp.iter_content(chunk_size=512)).decode("utf-8", "replace")
    m = re.search(r"data: (.+)", first)
    if not m:
        raise RuntimeError(f"Could not parse SSE endpoint from response: {first!r}")
    endpoint = m.group(1).strip()
    return resp, BASE_URL + endpoint


def reader_thread(resp, q):
    try:
        for raw in resp.iter_lines(decode_unicode=True):
            q.put(raw)
    except Exception as e:
        q.put(f"ERR:{e}")


def post_json(url, payload):
    r = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    return r.text


def wait_for_result(q, expected_id, timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        try:
            item = q.get(timeout=1)
        except queue.Empty:
            continue
        if not item or isinstance(item, str) and not item.startswith("data: "):
            continue
        try:
            obj = json.loads(item[len("data: "):])
        except Exception:
            continue
        if obj.get("id") == expected_id:
            return obj
    raise TimeoutError(f"Timed out waiting for MCP response id={expected_id}")


def main():
    if len(sys.argv) < 2:
        print("Usage: odoo_mcp_sse.py list-tools | call <tool> '<json>'")
        sys.exit(1)

    command = sys.argv[1]
    resp, post_url = open_sse_and_get_endpoint()
    q = queue.Queue()
    threading.Thread(target=reader_thread, args=(resp, q), daemon=True).start()

    post_json(post_url, {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "odoo-mcp-ngrok-skill", "version": "1.0.0"},
        },
    })
    wait_for_result(q, 1)
    post_json(post_url, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    if command == "list-tools":
        post_json(post_url, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        print(json.dumps(wait_for_result(q, 2), indent=2))
        return

    if command == "call":
        if len(sys.argv) < 4:
            print("Usage: odoo_mcp_sse.py call <tool> '<json>'")
            sys.exit(1)
        tool = sys.argv[2]
        args = json.loads(sys.argv[3])
        post_json(post_url, {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": tool, "arguments": args},
        })
        print(json.dumps(wait_for_result(q, 3), indent=2))
        return

    print(f"Unknown command: {command}")
    sys.exit(1)


if __name__ == "__main__":
    main()
