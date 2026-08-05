#!/usr/bin/env python3
"""Normalize Playwright results into a QEngine-friendly summary.

Reads a Playwright JSON report (preferred) or a JUnit XML report and writes
``reports/summary.json``. Extracts the ``[TC-xxx]`` id from each test title so
results map back to QEngine test cases.

Usage:
    python scripts/parse_results.py reports/results.json
    python scripts/parse_results.py reports/results.junit.xml
    python scripts/parse_results.py            # auto-detect in reports/
"""
from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

TC_ID_RE = re.compile(r"\[(?P<id>[A-Za-z]+-\d+)\]")


def _tc_id(title: str) -> str | None:
    m = TC_ID_RE.search(title or "")
    return m.group("id") if m else None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_playwright_json(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    tests: list[dict] = []

    def walk(suite: dict) -> None:
        for spec in suite.get("specs", []):
            title = spec.get("title", "")
            for t in spec.get("tests", []):
                results = t.get("results", [])
                last = results[-1] if results else {}
                status = last.get("status", t.get("status", "unknown"))
                errors = [e.get("message", "") for e in last.get("errors", [])]
                if not errors and last.get("error"):
                    errors = [last["error"].get("message", "")]
                tests.append(
                    {
                        "tc_id": _tc_id(title),
                        "title": title,
                        "status": _normalize_status(status),
                        "duration_ms": last.get("duration", 0),
                        "retries": max(len(results) - 1, 0),
                        "error": "\n".join(filter(None, errors)) or None,
                        "attachments": [
                            a.get("path")
                            for a in last.get("attachments", [])
                            if a.get("path")
                        ],
                    }
                )
        for child in suite.get("suites", []):
            walk(child)

    for suite in data.get("suites", []):
        walk(suite)
    return _summarize(tests)


def parse_junit(path: Path) -> dict:
    root = ET.parse(path).getroot()
    cases = root.iter("testcase")
    tests: list[dict] = []
    for c in cases:
        title = c.get("name", "")
        failure = c.find("failure")
        error = c.find("error")
        skipped = c.find("skipped")
        if failure is not None or error is not None:
            status = "failed"
            node = failure if failure is not None else error
            msg = (node.get("message") or node.text or "").strip()
        elif skipped is not None:
            status = "skipped"
            msg = None
        else:
            status = "passed"
            msg = None
        tests.append(
            {
                "tc_id": _tc_id(title),
                "title": title,
                "status": status,
                "duration_ms": int(float(c.get("time", "0")) * 1000),
                "retries": 0,
                "error": msg,
                "attachments": [],
            }
        )
    return _summarize(tests)


def _normalize_status(status: str) -> str:
    status = (status or "").lower()
    if status in {"passed", "expected"}:
        return "passed"
    if status in {"failed", "unexpected", "timedout"}:
        return "failed"
    if status in {"skipped"}:
        return "skipped"
    if status in {"flaky"}:
        return "passed"
    return status or "unknown"


def _summarize(tests: list[dict]) -> dict:
    totals = {"total": len(tests), "passed": 0, "failed": 0, "skipped": 0}
    duration = 0
    for t in tests:
        duration += t.get("duration_ms", 0) or 0
        if t["status"] in totals:
            totals[t["status"]] += 1
    return {
        "generated_at": _now(),
        "totals": totals,
        "duration_ms": duration,
        "passed_overall": totals["failed"] == 0 and totals["total"] > 0,
        "tests": tests,
    }


def _resolve_input(arg: str | None) -> Path:
    if arg:
        p = Path(arg)
        if not p.exists():
            sys.exit(f"[parse:error] file not found: {p}")
        return p
    reports = Path("reports")
    for name in ("results.json", "results.junit.xml"):
        candidate = reports / name
        if candidate.exists():
            return candidate
    sys.exit("[parse:error] no results file given and none found in reports/")


def main() -> int:
    src = _resolve_input(sys.argv[1] if len(sys.argv) > 1 else None)
    try:
        if src.suffix == ".json":
            summary = parse_playwright_json(src)
        elif src.suffix in {".xml"}:
            summary = parse_junit(src)
        else:
            sys.exit(f"[parse:error] unsupported file type: {src.suffix}")
    except (json.JSONDecodeError, ET.ParseError) as exc:
        sys.exit(f"[parse:error] could not parse {src}: {exc}")

    out = Path("reports") / "summary.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    t = summary["totals"]
    print(
        f"[parse] {t['passed']}/{t['total']} passed, "
        f"{t['failed']} failed, {t['skipped']} skipped "
        f"({summary['duration_ms']} ms) -> {out}"
    )
    for test in summary["tests"]:
        if test["status"] == "failed":
            ident = test["tc_id"] or test["title"]
            first_line = (test["error"] or "").splitlines()
            reason = first_line[0] if first_line else "no error message"
            print(f"  FAIL {ident}: {reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
