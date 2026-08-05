---
name: qengine-web-testing
description: >-
  Run plain-language web test cases in the browser, then automatically convert
  the completed flow into Zoho QEngine pro-code format and save it as a .txt
  file ready to paste into QEngine. Use when the user provides web test cases
  (markdown/text/Gherkin) to automate, asks to run web UI tests for QEngine, or
  wants QEngine-formatted test code generated from a completed run.
disable-model-invocation: true
---

# QEngine Web Testing

Run written web test cases in the browser, then convert the same flow into
**Zoho QEngine pro-code format** and save it as a `.txt` file. No network push
to QEngine — the output is a ready-to-paste code file.

Scoped to **web UI testing** (mobile and API out of scope for now).

## What this skill does

1. **Parse** plain-language test cases (markdown / text / Gherkin).
2. **Generate** Playwright specs (TypeScript or Python, auto-detected).
3. **Run** the tests with retries, tracing, and reports.
4. **Summarize** results (pass / fail / skip + failure reasons).
5. **Convert** the completed flow to QEngine pro-code and save as a `.txt` file.
6. **Handle errors** explicitly at every stage and fail loudly with guidance.

## Workflow

Copy this checklist and track progress:

```
- [ ] Step 0: Ensure the Playwright MCP server is installed/configured
- [ ] Step 1: Intake — ask the user for test cases, URL, auth, instructions, cookies
- [ ] Step 2: Detect project flavor (TS vs Python) and Playwright setup
- [ ] Step 3: Normalize the provided test cases
- [ ] Step 4: Generate / update spec files (apply auth + cookies)
- [ ] Step 5: Run tests via Cursor IDE browser tab (preferred) or Playwright terminal
- [ ] Step 6: Summarize results (pass/fail/skip + failure reasons)
- [ ] Step 7: Convert to QEngine pro-code and save as <name>_qengine.txt
- [ ] Step 8: Report back with artifacts and next actions
```

### Step 0: Ensure the Playwright MCP server (install if missing)

The browser automation runs through the **Playwright MCP** server. Before
anything else, confirm it is available — if not, install/configure it first.

1. Check whether a `playwright` MCP server is already configured:

```bash
python scripts/ensure_playwright_mcp.py --check
```

2. If it is missing, add it (idempotent; backs up and never clobbers other
   servers). Pass `--config` if the project ships a Playwright MCP config:

```bash
# Generic install:
python scripts/ensure_playwright_mcp.py

# Or with a project-specific config file:
python scripts/ensure_playwright_mcp.py \
  --config /absolute/path/to/.playwright-mcp/config.json
```

This writes an entry to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": { "PLAYWRIGHT_MCP_ISOLATED": "true" }
    }
  }
}
```

3. Warm the browser and install Chromium:

```bash
npx -y @playwright/mcp@latest --help >/dev/null 2>&1 || true
npx playwright install --with-deps chromium
```

4. **Restart Cursor** so the new server is picked up. A freshly installed MCP
   server does **not** work until Cursor is restarted — reloading or toggling is
   not enough. Tell the user: *"Playwright MCP is installed — please restart
   Cursor once, then continue."* and **pause** until they confirm.
   (If the server was already configured before this run, no restart is needed.)

### Step 1: Intake — ask the user what to test

Before generating or running anything, gather the run inputs. Ask these as a
single structured set of questions (don't interrogate one at a time). Skip any
the user already provided; only ask for what's missing.

Ask the user:

1. **Test case(s)** — "What are the test cases to automate?" (markdown / text /
   Gherkin). Optional when URL + target page are known — see **UI-driven
   discovery** below.
2. **URL** — "What is the URL / base URL of the app under test?" Required.
3. **Authentication** — "Does this need authentication? If so, what kind?"
   - None
   - Username/password form login (login URL + field labels + env var names for creds)
   - Token / API key / bearer header
   - SSO / OAuth (may need a one-time manual login to capture session)
4. **Custom instructions** — "Any specific instructions or constraints?"
   Browser (Chromium / Firefox / WebKit), headed vs headless, viewport, locale,
   slow-mo, parallelism, and data to avoid touching.
5. **Cookies** — "Any cookies to set before the test?" (name, domain, path;
   value via env var). Optional.

Record as a **run config** (never commit secrets):

```yaml
base_url: https://app.example.com
auth:
  type: form            # none | form | token | sso
  login_url: /login
  username_env: TEST_USER
  password_env: TEST_PASS
  token_env: TEST_TOKEN
cookies:
  - { name: session, value_env: SESSION_COOKIE, domain: app.example.com, path: / }
instructions:
  - Browser: chromium
  - Mode: headless
  - Do not modify production data
```

Rules:
- Never hardcode credentials, tokens, or cookie values — read from env vars.
- For SSO/OAuth, capture a session once via the Playwright MCP, save
  `storageState`, and reuse it.
- If auth is needed but no creds given, ask for the **env var names** only.
- If the **URL** is still missing, ask once more — never invent it.
- **Do not block on missing test cases** when a concrete page/module is implied
  (e.g. "test adding variables", "variables page", "required tab"). Use
  **UI-driven discovery** instead.

#### UI-driven discovery (when test cases are not provided)

If the user gives a URL (and optional feature hint) but **no explicit test
cases**, do **not** stop and wait. After auth:

1. Open the target page (or the hinted module / tab, e.g. Variables → Required).
2. Snapshot the UI: tabs, buttons, forms, empty states, validation, filters,
   pagination, row actions.
3. **Write a concrete list of possible test cases** from that UI (ids + titles +
   short expected results). Present the list to the user in the reply, then
   **immediately continue testing** the highest-value cases (create / required-
   field validation / happy path first) unless the user already narrowed scope.
4. Normalize those cases in Step 3 and proceed through Steps 4–8 as usual.
5. If a blocker (login, plan expiry, permissions) prevents seeing the page,
   report it and ask the user to unblock — do not invent cases for a page you
   could not inspect.

### Step 2: Detect project flavor

- `package.json` lists `@playwright/test` → **TypeScript/Node**.
- `pytest.ini` / `pyproject.toml` lists `pytest-playwright` → **Python**.
- Neither exists → default to TypeScript/Node and scaffold:

```bash
npm init -y
npm i -D @playwright/test
npx playwright install --with-deps chromium
```

### Step 3: Normalize the test cases

Sources (in order):
1. User-provided cases (markdown / text / Gherkin).
2. Cases produced by **UI-driven discovery** when none were provided.

For each test case extract (see [reference/test-case-format.md](reference/test-case-format.md)):

```yaml
id: TC-001
title: User can log in
priority: high
preconditions: [User account exists]
steps:
  - action: Navigate to /login
  - action: Fill "Email" with user@example.com
  - action: Click "Sign in"
expected:
  - URL is /dashboard
  - Heading "Welcome" is visible
```

If a provided case is ambiguous, ask once with concrete options — never
silently invent selectors or URLs. If **no** cases were provided, inventing
cases from the **inspected** page is required (see UI-driven discovery), not
optional.

Update the workflow checklist Step 1 note: test cases may be discovered from
the live page when not supplied.

### Step 4: Generate spec files (apply auth + cookies)

- One `test(...)` per case, named `"[TC-001] ..."` so the id survives into reports.
- Prefer role/label/text selectors; web-first assertions; shared fixtures.
- Apply run config: baseURL, auth (storageState / header), cookies via
  `context.addCookies(...)`, browser/viewport/locale from instructions.

See [templates/example.spec.ts](templates/example.spec.ts) and
[reference/playwright-patterns.md](reference/playwright-patterns.md).

### Step 5: Run and produce reports

**Preferred: use the Cursor IDE browser tab** (`cursor-ide-browser` MCP) to
execute each test step directly. This avoids Chromium install issues entirely
and works on any machine regardless of network restrictions.

Use `cursor-ide-browser` tools in this order for each test case:
1. `browser_navigate` → load the URL
2. `browser_snapshot` / `browser_take_screenshot` → verify page state visually
3. `browser_click`, `browser_fill`, `browser_select_option` → interact
4. **Immediately after EVERY interaction** → run `browser_cdp` (Runtime.evaluate) to capture the real `id`, `class`, XPath of every element you just touched. Do NOT defer this to later. Collect selectors at the moment of each action, not after the full test is done.
5. `browser_take_screenshot` → capture result as evidence

**Inline selector capture rule (MANDATORY):**

After each `browser_click` / `browser_fill` / `browser_select_option`, immediately run a CDP query like:
```js
// Example — run right after clicking a button:
document.querySelector('button.that-you-just-clicked').outerHTML.slice(0, 200)
// Or dump all visible interactive elements:
Array.from(document.querySelectorAll('input,button,select,[id]'))
  .filter(el => el.offsetParent !== null)
  .map(el => `${el.tagName} id="${el.id}" class="${el.className}" text="${el.textContent.trim().slice(0,30)}"`)
  .join('\n')
```
Record: `id` (if stable / non-random), `class`, `href`, `name`, `placeholder`, and any `data-*` attributes. Log these in a running selector table as you go. Use these captured selectors directly in the QEngine output — never guess or defer.

Only fall back to running `bash scripts/run_tests.sh` when the user
**explicitly asks** for a Playwright terminal run.

**If Playwright terminal run is needed:**

```bash
bash scripts/run_tests.sh
```

Writes `reports/results.json`, `reports/results.junit.xml`, traces and
screenshots on failure. Exits non-zero on test failure — continue to Step 6.

**Known blockers on corporate machines (do not waste time retrying):**

| Blocker | Symptom | Fix |
|---------|---------|-----|
| Corporate npm registry | `npm error 403` from `cm-npmregistry` | Add `--registry https://registry.npmjs.org` |
| Playwright CDN blocked | `403 Blocked by sandbox network policy` from `cdn.playwright.dev` | Switch to Cursor IDE browser tab (preferred) |
| Chromium version mismatch | `Executable doesn't exist at .../chromium_headless_shell-XXXX` | Version in cache ≠ version `@playwright/test` needs; use Cursor tab |
| `node_modules` missing | `npx playwright` tries to download instead of running | Run `npm install --registry https://registry.npmjs.org` first |
| `move_agent_to_root` timeout | MCP call hangs >90 s | Skip the move; work from the full absolute path directly |

### Step 6: Summarize results

```bash
python scripts/parse_results.py reports/results.json
```

Produces `reports/summary.json`: totals + per-test breakdown with failure
messages and trace paths.

### Step 7: Convert to QEngine pro-code — save as `<name>_qengine.txt`

Once the Playwright run is done, convert the **exact same flow** into a Zoho
QEngine pro-code test file and save it as `reports/<testname>_qengine.txt`.

This is the **final deliverable** — a file the user can open and paste
directly into the QEngine pro-code editor.

Follow [reference/qengine-script-syntax.md](reference/qengine-script-syntax.md)
exactly. Non-negotiable rules:

**QEngine output policy (user preferences):**
- **No authentication in QEngine code.** Do **not** generate login / SSO /
  username / password steps. Assume the session is already authenticated and
  start the script once the correct app page is open and testing has started
  (`openURL` to the page under test, then interactions).
- **Document each case in comments.** Prefix every automated block with a
  comment that names the test case id and title, e.g.
  `// TC1: Initial load shows total count and first page of variables`.
- **Pass-only automation.** Include **only PASS** test cases in the QEngine
  file. Failed / BUG cases are reported in the summary only — never converted
  into QEngine steps.

**Navigation (always the first line of the app flow — not login):**
```java
openURL("https://full-url/path", "same window");
```
Note: `URL` is capitalised; the second arg `"same window"` / `"new window"` is
required. Do not precede this with auth steps.

**Locators — bare selectors, never `xpath=` / `css=` prefix:**

| Type | Format | Example |
|------|--------|---------|
| id | `"#id"` | `setValue("#qaSvcName", "Test Service 1");` |
| class | `".class"` | `click(".vi-qa-submit");` |
| XPath | `"//..."` | `click("//button[@class='vi-add-menu-item'][2]");` |

**Key command rules:**
- `click(".btn");` — single argument only.
- `setValue("#id", "value");` — not `setText`.
- `wait(2);` — seconds, no `waitForElement`.
- `select(locator, "value", select.VALUE);`
- `switchTo(1, True);` / `switchTo(1, False);` — capital `True`/`False`.
- Every assertion ends with `errorhandling.STOP_ON_ERROR` or
  `errorhandling.CONTINUE_ON_ERROR`:
  `assertText(".vi-section-title", "Name", errorhandling.STOP_ON_ERROR);`
- Inspect the live DOM for real `id`/`class`; do not guess.
- **QEngine XPath supports ONLY attribute-based predicates.** Text functions
  (`text()`, `contains()`, `normalize-space()`, `starts-with()`, etc.) are
  **not supported** and will silently fail. The only safe XPath predicates are
  attribute comparisons and positional indexes:
  ```
  // CORRECT — attribute predicate:
  click("//button[@data-nav='staff']");
  click("//button[@class='vi-add-menu-item'][3]");

  // WRONG — text functions, all fail silently in QEngine:
  click("//button[text()='Staff']");
  click("//button[contains(.,'Staff')]");
  click("//button[normalize-space()='Staff']");
  ```
- **Asserting specific text content** — `assertText(locator, value, ...)` works
  when the locator is a `#id`, `.class`, or plain attribute XPath that uniquely
  identifies ONE element. If no unique `id`/`class`/attribute exists for the
  target element, assert a structural proxy instead (e.g., a count badge, a
  section title, a parent with a unique class):
  ```
  // Can't assert a specific staff name (no id/data-attr on the card) — use count:
  assertText(".vi-stf-count", "4 members", errorhandling.STOP_ON_ERROR);
  assertText(".vi-stf-title", "Staff", errorhandling.STOP_ON_ERROR);
  ```

**Verified real-world fixes (do not repeat these mistakes):**

| Assertion | WRONG — fails silently | CORRECT |
|-----------|----------------------|---------|
| Nav button loaded | `assertText("//button[text()='Staff']", ...)` | `assertText("//button[@data-nav='staff']", ...)` |
| Nav button loaded | `assertText("//button[contains(.,'Staff')]", ...)` | `assertText("//button[@data-nav='staff']", ...)` |
| Specific card text | `assertText("//div[@class='vi-stf-name'][text()='PW Staff Demo']", ...)` | Not possible — no `id`/`data-*` on card; use `assertText(".vi-stf-count", "N members", ...)` instead |
| Specific card text | `assertText("//div[@class='vi-stf-name'][contains(.,'PW Staff Demo')]", ...)` | Same as above — use count/title proxy |

**Decision rule for every assertion you write:**

> **Primary rule: only emit an `assertText` / `assertElement` if the element
> has a stable `id`. If no `id` is present, skip the assertion entirely —
> do NOT fall back to a class or XPath for assertions unless a `class` is
> provably unique and non-dynamic.**

Priority order (stop at the first match; if none match, omit the assertion):
1. **`id` present and stable (non-random)?** → `assertText("#id", ..., errorhandling.STOP_ON_ERROR);` ✅
2. **No `id` but a unique, non-dynamic `class`?** → `assertText(".class", ..., errorhandling.CONTINUE_ON_ERROR);` (use `CONTINUE` since class uniqueness may drift)
3. **No stable `id` or unique `class`?** → **skip the assertion**. Add a comment `// no stable id — assertion omitted` so the reviewer knows it was a deliberate choice, not an oversight.
4. **Never** use `text()`, `contains()`, `normalize-space()`, or positional XPath for assertions — these silently fail in QEngine.

This keeps the QEngine script lean and avoids brittle assertions that break on minor DOM changes.

See [templates/qengine_testcase.txt](templates/qengine_testcase.txt) as the
starting shape.

### Step 8: Report back

- Totals: passed / failed / skipped, duration.
- Each failure: test id, expected vs actual, trace path.
- Path to the generated `<name>_qengine.txt` file.

## Error handling rules

| Stage | Failure | Action |
|-------|---------|--------|
| Preflight | Playwright MCP not configured | Run `scripts/ensure_playwright_mcp.py`, restart Cursor |
| Preflight | MCP tools still missing | Restart Cursor; verify `~/.cursor/mcp.json` is valid JSON |
| Intake | Missing URL | Ask once more; never invent the URL |
| Intake | Missing test cases but URL/page known | UI-driven discovery — write cases from the page and continue |
| Intake | Auth needed but creds absent | Ask for env var names only; never raw secrets |
| Parse | Ambiguous/incomplete case | Ask once with options |
| Generate | Unknown selector | Best-guess + `TODO:` marker; flag to user |
| Run | Browser not installed / CDN blocked | Switch to Cursor IDE browser tab; do not retry install |
| Run | Corporate npm registry 403 | Use `--registry https://registry.npmjs.org` |
| Run | Flaky/timeout | Retries + tracing; report flakiness |
| Report | Missing `results.json` | Surface runner stderr; never fabricate |
| QEngine | `text()`, `contains()`, `normalize-space()` in XPath silently fail | Use attribute XPath only (`[@attr='val']`); assert text via `#id`/`.class` locators |

Full troubleshooting: [reference/playwright-patterns.md](reference/playwright-patterns.md).

## Custom command: `/load-product-doc <url-or-path>`

When the user provides a product document, spec sheet, URL, or any reference
material at the start of a session (or at any point), **always read it fully
before writing a single test step**.

Rules:
1. If a URL is given, fetch it with `WebFetch` and read all content.
2. If a file path is given, read the full file with the `Read` tool.
3. Extract and record in a local `product_context` block:
   - App name and purpose
   - Key features / modules being tested
   - Any URL patterns, field names, workflow names mentioned
   - Known constraints or environment notes
4. Use `product_context` to enrich test case normalization (Step 3), selector
   guesses (Step 4), and QEngine comments.
5. If the document reveals new selectors or workflows not yet in the skill,
   **add them as a new app-specific selector table** in the generated
   `<name>_qengine.txt` header comment block.

Example trigger phrases:
- "here is the product doc: …"
- "read this spec: …"
- "use this document for context: …"
- Any message that contains a URL or file path alongside a test request.

Never skip reading the document and proceed to testing — read first, test
second.

---

## Scope

- **In scope:** web UI testing with Playwright + QEngine pro-code output as `.txt`.
- **Out of scope:** mobile, API testing, and pushing results to QEngine over the
  network. If asked about push/CI integration, point to
  [reference/qengine.md](reference/qengine.md).
