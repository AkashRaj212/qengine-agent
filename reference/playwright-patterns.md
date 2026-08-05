# Playwright Patterns & Error Handling (Web)

Robust patterns for turning written test cases into reliable web tests. Applies
to `@playwright/test` (TS) and `pytest-playwright` (Python).

## Selector strategy (most → least preferred)

1. `getByRole('button', { name: 'Sign in' })` — accessible role + name.
2. `getByLabel('Email')` — form fields by label.
3. `getByText('Welcome')` / `getByPlaceholder(...)`.
4. `getByTestId('...')` — when devs add `data-testid`.
5. CSS — only for stable, semantic hooks.
6. **Avoid** XPath and index-based chains (`div > div:nth-child(3)`); they break.

When a selector can't be inferred from the test case, generate a best guess from
the accessible name and leave a `// TODO: confirm selector` marker, then flag it
to the user rather than shipping a silent guess.

## Web-first assertions (auto-waiting)

Use assertions that retry until a timeout — never manual sleeps.

```ts
await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
await expect(page).toHaveURL(/\/dashboard/);
await expect(page.getByRole('alert')).toContainText('Saved');
```

Anti-pattern:

```ts
await page.waitForTimeout(3000); // ❌ flaky, slow — do not use for sync
```

## Test shape (id-preserving)

```ts
import { test, expect } from '@playwright/test';

test('[TC-001] User can log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('Secret123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});
```

Keep the `[TC-xxx]` prefix — `parse_results.py` extracts it to map results back
to QEngine test cases.

## Config essentials (`playwright.config.ts`)

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 1,          // tame flakiness
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/results.json' }],
    ['junit', { outputFile: 'reports/results.junit.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',             // debuggable failures
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

## Python equivalent (`pytest-playwright`)

```python
# test_login.py
import re
from playwright.sync_api import Page, expect

def test_tc_001_user_can_log_in(page: Page):
    page.goto("/login")
    page.get_by_label("Email").fill("user@example.com")
    page.get_by_label("Password").fill("Secret123!")
    page.get_by_role("button", name="Sign in").click()
    expect(page).to_have_url(re.compile(r"/dashboard"))
    expect(page.get_by_role("heading", name="Welcome")).to_be_visible()
```

Run with JUnit + JSON:

```bash
pytest --base-url http://localhost:3000 \
  --junit-xml=reports/results.junit.xml \
  --tracing=retain-on-failure
```

> Python's pytest emits JUnit XML natively (`results.junit.xml`). The skill's
> parser reads JUnit XML when a Playwright JSON report isn't present.

## Authentication recipes

Read all secrets from environment variables — never hardcode them.

### Form login once, reuse session (`storageState`)

```ts
// auth.setup.ts  — run as a setup project, output a saved session
import { test as setup, expect } from '@playwright/test';
const authFile = 'reports/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.TEST_USER!);
  await page.getByLabel('Password').fill(process.env.TEST_PASS!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
```

Wire it in `playwright.config.ts`:

```ts
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  {
    name: 'chromium',
    dependencies: ['setup'],
    use: { storageState: 'reports/.auth/user.json' },
  },
],
```

### Token / bearer header

```ts
use: {
  extraHTTPHeaders: { Authorization: `Bearer ${process.env.TEST_TOKEN}` },
}
```

### SSO / OAuth (manual capture, then reuse)

Use the Playwright MCP browser to log in once manually, then save the session:

```ts
await page.context().storageState({ path: 'reports/.auth/user.json' });
```

Reuse it via `storageState` as above. Re-capture when it expires.

## Cookie injection

Set cookies before navigation, pulling values from env:

```ts
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: 'session',
      value: process.env.SESSION_COOKIE ?? '',
      domain: 'app.example.com',
      path: '/',
    },
  ]);
});
```

Notes:
- Either `url` **or** `domain`+`path` is required per cookie.
- Add cookies to the **context** before `page.goto`, not after.
- Keep cookie values in env / `.env` (gitignored), never in specs.

## Troubleshooting matrix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `browserType.launch: Executable doesn't exist` | Browsers not installed | `npx playwright install --with-deps chromium` then retry once |
| Test passes locally, fails in CI | Timing/viewport/baseURL diff | Use web-first assertions; set `baseURL`; raise `retries` in CI |
| `Timeout 30000ms exceeded` waiting for element | Wrong/late selector | Re-check accessible name; assert on a stable element; trace it |
| `strict mode violation: multiple elements` | Ambiguous locator | Narrow with role+name or `.first()` only when truly equivalent |
| Auth/login needed every test | No stored state | Use a global setup + `storageState` |
| Flaky network | Real backend latency | Mock with `page.route(...)` or wait on response, not on time |
| Empty `reports/results.json` | Runner crashed before reporting | Read runner stderr; fix config; do **not** fabricate a summary |
| 401 from QEngine push | Bad/missing API key | Re-check `QENGINE_API_KEY`; regenerate under Setup → API Keys |
| Connection error to QEngine | Wrong base URL / network | Verify `QENGINE_BASE_URL`; run with `--dry-run` to inspect payload |

## Stability checklist before reporting

- [ ] No `waitForTimeout` used for synchronization
- [ ] All selectors role/label/text/testid based
- [ ] `retries` and `trace: retain-on-failure` enabled
- [ ] Reports written to `reports/` (JSON + JUnit)
- [ ] Every test title carries its `[TC-xxx]` id
