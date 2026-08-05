# Zoho QEngine — Integration Reference

Everything the skill needs to know about Zoho QEngine, focused on **web
testing** and on getting Playwright results into QEngine.

> Source note: facts below are verified from Zoho's public product pages, the
> official Jenkins plugin (`jenkinsci/zohoqengine-plugin`), and the Jenkins
> step reference. The QEngine help portal is a JavaScript-rendered SPA, so the
> exact in-app tab/column labels could not be machine-fetched. Sections marked
> **[confirm in-app]** are placeholders for you to fill from your QEngine
> account so this file becomes the single source of truth.

## What QEngine is

Zoho QEngine is a cloud-based, agentic test automation platform for **web,
mobile, and API** testing. Relevant capabilities for this skill:

- Scriptless test creation, self-healing locators, central element repository.
- Unified **test case management** across web/mobile/API.
- **Reporting dashboard**: runs, passed, failed, logs, KPIs, drill-down.
- **CI/CD integration** (e.g. Jenkins) to trigger executions and collect reports.

## The QEngine object model (how work is organized)

```
Test Case  ──grouped into──>  Test Suite  ──pushed to──>  Test Plan  ──scheduled/triggered──>  Execution → Report
```

- **Test Case** — a single scenario (web/mobile/API). Maps 1:1 to a Playwright
  `test(...)`. Keep the QEngine test-case id in the Playwright test title,
  e.g. `"[TC-001] User can log in"`.
- **Test Suite** — a named group of test cases (created after manager approval).
- **Test Plan** — what actually gets executed/scheduled; exposes a
  **Test Plan Execution URL** used by CI.
- **Execution / Report** — results with logs, pass/fail counts, and failure
  locations, viewable on the dashboard.

## Authentication

- **API Key** is the credential for programmatic access.
  - Location: **Setup → API Keys → Generate API Key**.
  - Treat it as a secret. Provide it to the skill via `QENGINE_API_KEY` env var.
- QEngine's **API testing** module additionally supports API key, Basic, OAuth1,
  and OAuth2 auth methods (relevant only if you test APIs — out of scope here).

## Test Plan Execution URL

- Retrieve from the **Test Plans** section of your QEngine dashboard.
- This is the URL CI uses to trigger a plan and (for Jenkins) poll for results.
- Provide to the skill via `QENGINE_BASE_URL` (or a dedicated
  `QENGINE_TEST_PLAN_URL`).

## Verified CI integration — Jenkins (the blessed path)

QEngine ships an official Jenkins plugin: **Zoho QEngine Test Plan Execution**.

Pipeline step: `zohoQEngineTestPlanExecution`

| Parameter | Type | Meaning |
|-----------|------|---------|
| `testPlanUrl` | String | Test Plan Execution URL (from Test Plans section) |
| `apiKey` | String | API Key (Setup → API Keys) |
| `maxWaitTime` | int | Minutes to wait before failing the build on long runs |
| `buildName` | String | Label; QEngine prefixes this to the Jenkins build id |

Example declarative pipeline:

```groovy
pipeline {
  agent any
  stages {
    stage('QEngine Test Plan') {
      steps {
        zohoQEngineTestPlanExecution(
          testPlanUrl: "${QENGINE_TEST_PLAN_URL}",
          apiKey: "${QENGINE_API_KEY}",
          maxWaitTime: 30,
          buildName: "playwright-${env.BUILD_NUMBER}"
        )
      }
    }
  }
}
```

After execution, logs and reports (run/passed/failed, code changes, failure
locations) are reviewable both in Jenkins and the QEngine dashboard.

## How this skill shares Playwright output with QEngine

There are two complementary modes:

### Mode A — Trigger a QEngine test plan (managed execution)
Use when your scenarios live in QEngine as a Test Plan. CI (Jenkins or the
`push_to_qengine.py` connector in trigger mode) calls the Test Plan Execution
URL with the API key; QEngine runs and reports. Best for the official workflow.

### Mode B — Push Playwright results as a report (external execution)
Use when Playwright runs the tests and you want the outcome reflected in
QEngine. The skill produces standard **JUnit XML** + **JSON**, then
`push_to_qengine.py` POSTs a normalized summary to a configurable endpoint.

> **[confirm in-app]** The exact "import external results / results webhook"
> endpoint for Mode B depends on your QEngine account/plan. Fill in the real
> path here once confirmed; the connector is written to be pointed at any
> endpoint via `QENGINE_BASE_URL` without code changes.

## Environment variables used by the skill

| Variable | Required | Purpose |
|----------|----------|---------|
| `QENGINE_BASE_URL` | yes (push) | Ingest endpoint or Test Plan Execution URL |
| `QENGINE_API_KEY` | yes (push) | API key from Setup → API Keys |
| `QENGINE_BUILD_NAME` | no | Build label (defaults to timestamp) |
| `QENGINE_TIMEOUT_SECONDS` | no | HTTP timeout (default 30) |

## QEngine UI map — tabs & columns  **[confirm in-app]**

Capture the exact labels from your account so the skill can reference them
precisely. Suggested structure to fill in:

### Tabs / left navigation
- [ ] Dashboard — _columns/widgets: ..._
- [ ] Test Cases — _columns: id, name, module, priority, status, last run, ..._
- [ ] Test Suites — _columns: name, # cases, owner, ..._
- [ ] Test Plans — _columns: name, schedule, last execution, execution URL, ..._
- [ ] Executions / Reports — _columns: build name, run, passed, failed, skipped,
      duration, browser/env, started at, ..._
- [ ] Element Repository — _columns: ..._
- [ ] Setup → API Keys — _columns: key name, created, last used, ..._

### Reporting dashboard fields (verified categories)
- Tests run, passed, failed (and where each test failed)
- Time taken per test
- Logs for detect/rectify/understand failures
- Best-fit environment (devices, browsers, OS)
- Custom reports / trends

## Writing QEngine test case code

QEngine has a recorder, a low-code builder, and a **pro-code editor** with
Java/JavaScript-like syntax. When the skill converts a completed Playwright run
into a QEngine test file, follow the command reference:
[qengine-script-syntax.md](qengine-script-syntax.md).

## Useful links

- Product: https://www.zoho.com/qengine/
- Jenkins integration: https://www.zoho.com/qengine/integrations/jenkins.html
- Jenkins plugin: https://github.com/jenkinsci/zohoqengine-plugin
- Jenkins step ref: https://www.jenkins.io/doc/pipeline/steps/zohoqengine/
- User guide: https://help.zoho.com/portal/en/kb/qengine/user-guide
- Reporting feature: https://www.zoho.com/qengine/features/test-reporting-dashboard.html
- Test case management: https://www.zoho.com/qengine/features/test-case-management.html
