#!/usr/bin/env python3
"""Ensure the Playwright MCP server is configured in Cursor.

Idempotent: if `~/.cursor/mcp.json` has no `playwright` entry under
`mcpServers`, this adds one without touching any other servers. Existing
playwright config is left as-is (use --force to overwrite).

Usage:
    python scripts/ensure_playwright_mcp.py
    python scripts/ensure_playwright_mcp.py --config /path/to/.playwright-mcp/config.json
    python scripts/ensure_playwright_mcp.py --force
    python scripts/ensure_playwright_mcp.py --check     # report only, exit 1 if missing
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

MCP_PATH = Path.home() / ".cursor" / "mcp.json"


def default_entry(config_path: str | None) -> dict:
    args = ["@playwright/mcp@latest"]
    if config_path:
        args += ["--config", config_path]
    return {
        "command": "npx",
        "args": args,
        "env": {"PLAYWRIGHT_MCP_ISOLATED": "true"},
    }


def load(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        text = path.read_text(encoding="utf-8").strip()
        return json.loads(text) if text else {}
    except json.JSONDecodeError as exc:
        sys.exit(f"[mcp:error] {path} is not valid JSON: {exc}. Fix it and retry.")


def main() -> int:
    ap = argparse.ArgumentParser(description="Ensure Playwright MCP is configured.")
    ap.add_argument("--config", help="Path to a .playwright-mcp/config.json")
    ap.add_argument("--force", action="store_true", help="Overwrite existing entry")
    ap.add_argument("--check", action="store_true", help="Report only; exit 1 if missing")
    args = ap.parse_args()

    data = load(MCP_PATH)
    servers = data.setdefault("mcpServers", {}) if not args.check else data.get(
        "mcpServers", {}
    )
    exists = "playwright" in (servers or {})

    if args.check:
        if exists:
            print("[mcp] playwright MCP is configured.")
            return 0
        print("[mcp] playwright MCP is NOT configured.")
        return 1

    if exists and not args.force:
        print(f"[mcp] playwright already configured in {MCP_PATH}; leaving as-is.")
        print("[mcp] (use --force to overwrite, or --config to set a config path.)")
        return 0

    if MCP_PATH.exists():
        backup = MCP_PATH.with_suffix(".json.bak")
        shutil.copy2(MCP_PATH, backup)
        print(f"[mcp] backed up existing config -> {backup}")

    servers["playwright"] = default_entry(args.config)
    MCP_PATH.parent.mkdir(parents=True, exist_ok=True)
    MCP_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    action = "updated" if exists else "added"
    print(f"[mcp] {action} playwright server in {MCP_PATH}.")
    print("[mcp] IMPORTANT: restart Cursor once for the new MCP server to load.")
    print("[mcp] (Reloading/toggling is not enough for a freshly added server.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
