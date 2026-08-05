# QEngine Web Testing Skill

A Cursor Agent Skill that turns plain-language **web** test cases into runnable
browser tests, executes them with robust error handling, and converts the flow
into **[Zoho QEngine](https://www.zoho.com/qengine/)** pro-code saved as a
ready-to-paste `.txt` file.

> Scope: web UI testing. Mobile and API testing are intentionally out of scope
> for now. Network push to QEngine is out of scope — the deliverable is a local
> pro-code file.

## Why

Writing reliable end-to-end tests and rewriting them for QEngine is repetitive
and error-prone. This skill standardizes the loop — parse → generate → run →
report → convert to QEngine pro-code — with accessible-first selectors,
retries/tracing, and explicit error handling.

## What it does

1. **Parse** test cases written in markdown / text / Gherkin into a normalized
   structure.
2. **Generate** Playwright tests in your project's flavor (TypeScript or Python).
3. **Run** them via the Cursor IDE browser tab (preferred) or Playwright CLI.
4. **Summarize** outcomes (with `[TC-xxx]` ids preserved for traceability).
5. **Convert** the completed (pass-only) flow into QEngine pro-code and save as
   `reports/<name>_qengine.txt`.

## Layout

```
qengine-agent/
├── SKILL.md                          # the skill (entry point)
├── reference/
│   ├── qengine.md                    # verified QEngine integration details
│   ├── qengine-script-syntax.md      # QEngine pro-code command syntax + mapping
│   ├── playwright-patterns.md        # robust patterns + troubleshooting matrix
│   └── test-case-format.md           # accepted input formats + mapping rules
├── scripts/
│   ├── ensure_playwright_mcp.py      # install/configure Playwright MCP if missing
│   ├── run_tests.sh                  # run Playwright (TS/Python) → reports
│   ├── parse_results.py              # results.json/junit.xml → summary.json
│   └── push_to_qengine.py            # optional push helper (not part of default flow)
├── templates/
│   ├── example.spec.ts               # id-preserving spec template
│   ├── auth.setup.ts                 # form-login session capture
│   ├── qengine_testcase.txt          # QEngine pro-code test case template
│   └── playwright.config.ts          # QEngine-friendly reporter config
└── .env.example
```

## Install as a Cursor skill

Copy (or symlink) this folder into your Cursor skills directory:

```bash
# Personal (all projects)
cp -R . ~/.cursor/skills/qengine-web-testing

# or Project-scoped (shared with the repo)
cp -R . <your-repo>/.cursor/skills/qengine-web-testing
```

Then in Cursor, invoke it by name when you have web test cases to automate.

## Quick start (standalone)

```bash
# 0. Ensure the Playwright MCP server is configured (installs if missing)
python scripts/ensure_playwright_mcp.py --check || python scripts/ensure_playwright_mcp.py

# 1. Configure (optional — only if using the push helper)
cp .env.example .env

# 2. Run tests → reports/ (or use Cursor IDE browser tab per SKILL.md)
bash scripts/run_tests.sh

# 3. Summarize
python scripts/parse_results.py reports/results.json

# 4. QEngine deliverable is produced by the agent as reports/<name>_qengine.txt
```

## QEngine output

The agent writes a pro-code file you paste into the QEngine editor. Rules of
thumb (full detail in [SKILL.md](SKILL.md) and
[reference/qengine-script-syntax.md](reference/qengine-script-syntax.md)):

- No auth/login steps — assume an already-authenticated session
- Pass-only cases; failed/BUG cases stay in the summary only
- Attribute-based XPath only (`text()` / `contains()` silently fail in QEngine)
- Prefer stable `#id` for assertions

Optional API push / trigger modes still live in
[reference/qengine.md](reference/qengine.md) and `scripts/push_to_qengine.py`,
but are not part of the default skill workflow.

## Requirements

- Node 18+ with `@playwright/test`, **or** Python 3.10+ with `pytest-playwright`
- Python 3.10+ for the helper scripts (standard library only — no extra deps)
- Cursor with Playwright MCP (or the Cursor IDE browser tab) for preferred runs

## License

MIT — see [LICENSE](LICENSE).
