# Learn recipes

A recipe is a note, written while a test passes, that says how to reach one
action in one product. A later test reads it and copies the shared steps.

Recipes live in this skill folder:

```
learned/<product-slug>/INDEX.md
learned/<product-slug>/<verb>-<entity>.md
```

`<product-slug>` is the host with dots replaced by hyphens
(`bookings.zoho.com` → `bookings-zoho-com`), or the product name the user
used, lowercased, spaces as hyphens.

`<verb>-<entity>` examples: `add-cx`, `add-appointment`, `edit-cx`.

Write a recipe only after the path has been executed and the case passed.
Never put passwords, tokens, or real customer data in a recipe.

Do not hand-write these files. Use `scripts/learn_recipe.js`. It writes the
markdown, a JavaScript module that exports `runSharedPath`, and `INDEX.md`.

```bash
node scripts/learn_recipe.js match \
  --product "https://bookings.zoho.com" \
  --action "add appointment" \
  --pattern create-from-add-menu

node scripts/learn_recipe.js save --file recipe.json

node scripts/learn_recipe.js list --product bookings.zoho.com
```

`match` prints JSON. Exit code `2` means nothing to reuse. `save` reads the
JSON shape in the script header and refuses the write when `passed` is not
`true`.

The JavaScript module is `learned/<product-slug>/<verb>-<entity>.js`:

```javascript
const { runSharedPath } = require("./add-cx.js");
await runSharedPath(page, {
  menuItem: async (page) => {},
  fields: async (page) => {},
});
```

`menuItem` and `fields` are the only parts that change for a new entity.
Comments in `qengineShared` that contain the word `specific` become those hooks.

## INDEX.md

One block per recipe. The next run reads this file first.

```markdown
# Learned flows — bookings.zoho.com

- action: add-cx
  pattern: create-from-add-menu
  file: add-cx.md
  shared: Open the bookings module, click Add, pick the entity in the add menu, fill the dialog, click submit.
```

## Recipe file

```markdown
# add-cx

product: bookings.zoho.com
action: add-cx
verb: add
entity: cx
pattern: create-from-add-menu
page: https://bookings.zoho.com/app/bookings
learned: 2026-10-13
updated: 2026-10-13

## Reach

Open the bookings module. The Add control is the button with class
`vi-bookings-add-btn`. It opens a menu of entity types. Cx is one item in
that menu. Choosing it opens a dialog. Submit is the button with class
`vi-qa-submit`.

## Shared steps

These steps are the shell. Reuse them for any other `add` action with
pattern `create-from-add-menu` on this product (for example add appointment).

1. openURL the page above, same window.
2. click `.vi-bookings-add-btn` — opens the add menu.
3. wait 2 seconds for the menu.
4. After the entity menu item is chosen, wait 2 seconds for the dialog.
5. click `.vi-qa-submit` — submits the dialog.
6. wait 2 seconds for the result.

## Specific steps

Only for Cx. Do not copy these onto appointment.

1. click `//button[@data-entity='cx']` — Cx menu item.
2. setValue `#qaCxName` — Cx name, required.
3. Success check: `#qaCxToast` text is `Cx added`.

## QEngine shared block

```java
// reused from learned/bookings-zoho-com/add-cx.md (shared path)
openURL("https://bookings.zoho.com/app/bookings", "same window");
wait(2);
click(".vi-bookings-add-btn");
wait(2);
// entity menu item goes here — specific, not shared
wait(2);
// entity fields go here — specific, not shared
click(".vi-qa-submit");
wait(2);
```

## How to reuse for a new entity

1. Copy every shared step, including the QEngine shared block.
2. In the browser, confirm `.vi-bookings-add-btn` is still the Add control.
3. Open the menu and capture only the new entity's menu item and fields.
4. Leave a comment on reused lines:
   `// reused from learned/bookings-zoho-com/add-cx.md (shared path)`.
```

## Matching a later case to a recipe

| New case | Existing recipe | What to copy |
|----------|-----------------|--------------|
| add Cx again | `add-cx` exact action | Whole recipe |
| add appointment, same Add button and dialog shell | `add-cx` with pattern `create-from-add-menu` | Shared steps only. Discover the appointment menu item and fields |
| delete Cx | `add-cx` is a different verb and pattern | Do not reuse. Explore delete, or use a `delete-row` recipe if one exists |

Same pattern means the shell matches: same page, same entry control, same
dialog or menu behavior. The entity name, menu item, and fields may differ.
