# QEngine Pro-Code Script Syntax

How to write QEngine test case code. This is the **target format** when the
skill converts a completed Playwright run into a QEngine test file.

Syntax is Java/JavaScript-like. Every statement ends with `;`. Comments use `//`.

## Locators (two forms)

1. **Element Repository reference** (preferred; what the QEngine recorder
   produces): `ui.<page_namespace>.<element_name>`

```java
click(ui.qengine_command_sandbox.click_btn);
setValue(ui.zoho_bookings.temp_0_6475468484744764_edit, @service_name);
```

2. **Inline locator string** — bare selector, **no `xpath=` / `css=` prefix**:

| Selector type | Format | Example |
|---------------|--------|---------|
| Element id | `"#id"` | `setValue("#qaSvcName", "akash");` |
| Class | `".class"` (leading dot) | `click(".vi-qa-submit");` |
| XPath | `"//..."` or `"/..."` | `click("//button[1]");` |

```java
setValue("#qaSvcName", "Test Service 1");      // by id
click(".vi-qa-submit");                          // by class
click("//button[@class='vi-add-menu-item'][2]"); // by xpath
```

## Locator selection priority

When writing inline locators, prefer in this order (most → least robust):

1. **Element id** (CSS form): `"#qaSvcName"`
2. **Stable QA-hook class** (CSS form, leading dot): `".vi-qa-submit"`
   (many apps add `data-*`, `qa-*`, or `vi-qa-*` hooks — use them)
3. **XPath with attribute + index** when several share a class:
   `"//button[@class='vi-add-menu-item'][2]"`
4. **XPath text match** (exact, no `normalize-space`): `"//div[text()='Test Service 1']"`

Avoid:
- `normalize-space()` predicates — not reliable in QEngine's XPath engine
  (e.g. `//button[normalize-space()='+']` will fail to match).
- Brittle absolute paths like `/html/body/bookings-home/div[1]/header/...`
  (what you see in "Copy full XPath") — use only as a last resort when no
  id/attribute exists.

Inspect the live DOM (e.g. via the Playwright MCP / DevTools) to read the real
`id`/`class` before writing locators; do not guess attribute names.

## Navigation

Every test case **starts** with `openURL`. Note the capitalisation (`URL`) and
the required second argument (the window target):

```java
openURL("https://example.com/", "same window");   // or "new window"
back();
```

| Command | Format |
|---------|--------|
| Open URL | `openURL("<full-url>", "same window");`  // or `"new window"` |
| Go back | `back();` |

## Interactions

```java
click(locator);
doubleClick(locator);
rightClick(locator);
setValue(locator, "text");        // type into input (NOT setText)
clear(locator);                    // clear an input
scrollTo(locator);
check(locator);                    // checkbox on
uncheck(locator);                  // checkbox off
sendKeys(locator, [keys.LEFT, keys.ARROW_DOWN]);
upload(locator, files.<file_name>);
```

## Select / dropdown

Match mode is a `select.*` constant. `select.VALUE` is confirmed from the
reference script; use it unless your QEngine version documents others.

```java
select(locator, "alpha", select.VALUE);    // select option whose value is "alpha"
```

## Waiting

QEngine does **not** support `waitForElement`. Use a fixed wait in seconds:

```java
wait(5);    // wait 5 seconds
wait(1);
```

## Frames & windows

`switchTo(index, <boolean>)`. The boolean is **capitalised** `True` / `False`
(Python-style), not `true`/`false`.

```java
switchTo(1, True);    // switch into frame/window index 1
switchTo(1, False);   // switch back out
```

## Assertions

Every assertion takes an **error-handling mode** as its **last argument**:
`errorhandling.STOP_ON_ERROR` or `errorhandling.CONTINUE_ON_ERROR`.

```java
assertText(locator, "Expected text", errorhandling.STOP_ON_ERROR);
assertValue(locator, "expected value", errorhandling.STOP_ON_ERROR);
assertVisible(locator, errorhandling.STOP_ON_ERROR);
assertHidden(locator, errorhandling.STOP_ON_ERROR);
assertDisabled(locator, errorhandling.STOP_ON_ERROR);
assertSelected(locator, errorhandling.STOP_ON_ERROR);
assertFocused(locator, errorhandling.STOP_ON_ERROR);
assertNotPresent(locator, errorhandling.STOP_ON_ERROR);
assertImageExists(locator, errorhandling.CONTINUE_ON_ERROR);
```

## Getters & logging

`info(...)` logs a message; it accepts a string, a concatenation, or a value/
locator directly.

```java
info("getText : " + getText(locator));
info("getAttribute : " + getAttribute(locator, "id"));
info("getCount : " + getCount(locator));
info("getWidth : " + getWidth(locator));
info("getHeight : " + getHeight(locator));
info(ui.page.some_element);                 // value/locator directly is allowed
```

## Variables / test parameters

Test parameters are referenced with a leading `@`. Concatenate non-strings
with `+""` to stringify:

```java
setValue(ui.zoho_bookings.temp_0_6475468484744764_edit, @service_name);
setValue(ui.zoho_bookings.zq_1, @cost + "");
assertValue(locator, @cost + "", errorhandling.STOP_ON_ERROR);
```

## Reusable functions / modules

Call shared functions as `<module>.<function>();`

```java
zohobookings.account_login_cookie();
```

## Conversion rules (Playwright → QEngine)

| Playwright | QEngine |
|------------|---------|
| `page.goto(url)` | `openURL("url", "same window");` |
| `locator.click()` | `click(locator);` |
| `locator.dblclick()` | `doubleClick(locator);` |
| `locator.fill(v)` | `setValue(locator, "v");` |
| `locator.clear()` | `clear(locator);` |
| `selectOption(v)` | `select(locator, "v", select.VALUE);` |
| `check()` / `uncheck()` | `check(locator);` / `uncheck(locator);` |
| `expect(x).toHaveText(t)` | `assertText(locator, "t", errorhandling.STOP_ON_ERROR);` |
| `expect(x).toBeVisible()` | `assertVisible(locator, errorhandling.STOP_ON_ERROR);` |
| `expect(x).toHaveValue(v)` | `assertValue(locator, "v", errorhandling.STOP_ON_ERROR);` |
| `expect(x).toBeHidden()` | `assertHidden(locator, errorhandling.STOP_ON_ERROR);` |
| `waitForTimeout(ms)` / sync wait | `wait(seconds);` |
| `page.goBack()` | `back();` |
| `console.log(...)` | `info("...");` |

Notes:
- There is **no** `waitForElement`. Add `wait(n);` before steps that need the
  UI to settle (e.g. after opening a dialog or after submit).
- Prefer `ui.<page>.<element>` repository references; fall back to
  inline `"#id"` / `".class"` / `"//xpath"` locators only when needed.
