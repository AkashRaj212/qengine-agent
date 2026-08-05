#!/usr/bin/env python3
"""Push a normalized test summary to Zoho QEngine.

Pluggable connector. The exact ingest endpoint depends on your QEngine account
(see reference/qengine.md). It is configured entirely via environment variables
so no secret or URL is ever hardcoded.

Modes:
  report   (default) POST the summary JSON to QENGINE_BASE_URL
  trigger  POST to a Test Plan Execution URL to start a managed QEngine run

Environment:
  QENGINE_BASE_URL         required  ingest endpoint OR test plan execution URL
  QENGINE_API_KEY          required  Setup -> API Keys
  QENGINE_BUILD_NAME       optional  build label (default: timestamp)
  QENGINE_TIMEOUT_SECONDS  optional  HTTP timeout (default 30)

Usage:
  python scripts/push_to_qengine.py reports/summary.json
  python scripts/push_to_qengine.py reports/summary.json --dry-run
  python scripts/push_to_qengine.py --mode trigger
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request


def _env(name: str, default: str | None = None) -> str | None:
    val = os.environ.get(name, default)
    return val.strip() if isinstance(val, str) else val


def _build_name() -> str:
    return _env("QENGINE_BUILD_NAME") or "playwright-" + datetime.now(
        timezone.utc
    ).strftime("%Y%m%d-%H%M%S")


def _require(name: str) -> str:
    val = _env(name)
    if not val:
        sys.exit(
            f"[qengine:error] missing required env var {name}. "
            f"See reference/qengine.md. Local reports are still in reports/."
        )
    return val


def build_payload(summary: dict, build_name: str) -> dict:
    """Map the normalized summary to a QEngine-friendly payload.

    Adjust field names here to match your QEngine ingest contract once confirmed.
    """
    t = summary.get("totals", {})
    return {
        "buildName": build_name,
        "source": "playwright",
        "generatedAt": summary.get("generated_at"),
        "durationMs": summary.get("duration_ms", 0),
        "summary": {
            "total": t.get("total", 0),
            "passed": t.get("passed", 0),
            "failed": t.get("failed", 0),
            "skipped": t.get("skipped", 0),
            "passedOverall": summary.get("passed_overall", False),
        },
        "results": [
            {
                "testCaseId": test.get("tc_id"),
                "name": test.get("title"),
                "status": test.get("status"),
                "durationMs": test.get("duration_ms", 0),
                "error": test.get("error"),
            }
            for test in summary.get("tests", [])
        ],
    }


def post_json(url: str, api_key: str, payload: dict, timeout: int) -> tuple[int, str]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    # QEngine uses an API key; send it the common ways so it works across setups.
    req.add_header("Authorization", f"Zoho-authtoken {api_key}")
    req.add_header("X-API-Key", api_key)
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except error.URLError as exc:
        sys.exit(f"[qengine:error] network error reaching QEngine: {exc.reason}")


def load_summary(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        sys.exit(
            f"[qengine:error] summary not found: {p}. "
            f"Run scripts/parse_results.py first."
        )
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"[qengine:error] invalid summary JSON: {exc}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Push test results to Zoho QEngine.")
    ap.add_argument("summary", nargs="?", default="reports/summary.json")
    ap.add_argument("--mode", choices=["report", "trigger"], default="report")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the payload/target without making a network call.",
    )
    args = ap.parse_args()

    build_name = _build_name()
    timeout = int(_env("QENGINE_TIMEOUT_SECONDS") or "30")

    if args.mode == "trigger":
        # Managed execution: just hit the Test Plan Execution URL.
        url = _require("QENGINE_BASE_URL")
        payload = {"buildName": build_name}
    else:
        summary = load_summary(args.summary)
        payload = build_payload(summary, build_name)
        url = _env("QENGINE_BASE_URL")

    if args.dry_run:
        print(f"[qengine:dry-run] mode={args.mode}")
        print(f"[qengine:dry-run] target={url or '<QENGINE_BASE_URL unset>'}")
        print(f"[qengine:dry-run] build={build_name}")
        print(json.dumps(payload, indent=2))
        return 0

    url = _require("QENGINE_BASE_URL")
    api_key = _require("QENGINE_API_KEY")

    status, text = post_json(url, api_key, payload, timeout)
    if 200 <= status < 300:
        print(f"[qengine] pushed '{build_name}' OK (HTTP {status}).")
        return 0
    if status in (401, 403):
        sys.exit(
            f"[qengine:error] auth failed (HTTP {status}). "
            f"Check QENGINE_API_KEY (Setup -> API Keys). Response: {text[:300]}"
        )
    sys.exit(f"[qengine:error] push failed (HTTP {status}). Response: {text[:500]}")


if __name__ == "__main__":
    raise SystemExit(main())
