# Test Case Format

How the skill reads written test cases and normalizes them. Accepts markdown,
plain text, or Gherkin. The goal is a consistent structure that maps cleanly to
a Playwright `test(...)` and back to a QEngine test case.

## Normalized schema

```yaml
id: TC-001                 # stable id; auto-generated (TC-001, TC-002, ...) if absent
title: User can log in     # short, imperative
priority: high             # high | medium | low (default: medium)
tags: [auth, smoke]        # optional
preconditions:
  - User account exists
steps:
  - action: Navigate to /login
  - action: Fill "Email" with user@example.com
  - action: Fill "Password" with Secret123!
  - action: Click "Sign in"
expected:
  - URL is /dashboard
  - Heading "Welcome" is visible
```

## Accepted inputs

### Markdown / text
```
TC-001: User can log in (priority: high)
Pre: user account exists
Steps:
1. Go to /login
2. Enter email user@example.com
3. Enter password
4. Click Sign in
Expected: redirected to /dashboard and "Welcome" heading shown
```

### Gherkin
```gherkin
Scenario: User can log in
  Given a registered user
  When they submit valid credentials on /login
  Then they land on /dashboard
  And they see the "Welcome" heading
```

## Mapping rules

| Written phrase | Playwright translation |
|----------------|------------------------|
| "Go to / Navigate to X" | `page.goto('X')` |
| "Click \"Label\"" | `getByRole('button', { name: 'Label' }).click()` |
| "Enter/Fill \"Field\" with V" | `getByLabel('Field').fill('V')` |
| "Select \"Option\" in \"Field\"" | `getByLabel('Field').selectOption('Option')` |
| "See/visible \"Text\"" | `expect(getByText('Text')).toBeVisible()` |
| "URL is X" | `expect(page).toHaveURL(/X/)` |

## Ambiguity handling

If a case lacks a URL, an unambiguous selector, or an expected result, ask the
user once with concrete options. Do **not** invent selectors or URLs silently —
generate a best guess only with a visible `TODO:` marker and call it out.
