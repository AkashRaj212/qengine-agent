#!/usr/bin/env node
"use strict";

/**
 * Learn command helper.
 *
 * Saves how a product action is reached (markdown recipe + reusable
 * JavaScript module) and, on a later case, returns the shared path so
 * only the entity-specific steps need to be discovered.
 *
 *   node scripts/learn_recipe.js match --product "https://bookings.zoho.com" --action "add appointment" --pattern create-from-add-menu
 *   node scripts/learn_recipe.js save --file recipe.json
 *   node scripts/learn_recipe.js list --product bookings.zoho.com
 *
 * save reads JSON from --file or stdin. Refuses to write when passed is not true.
 * match exits 2 when nothing reusable exists.
 *
 * save JSON:
 * {
 *   "passed": true,
 *   "product": "bookings.zoho.com",
 *   "verb": "add",
 *   "entity": "cx",
 *   "pattern": "create-from-add-menu",
 *   "page": "https://bookings.zoho.com/app/bookings",
 *   "reach": "Open the bookings module. Click Add (.vi-bookings-add-btn).",
 *   "sharedSummary": "Open the module, click Add, choose the entity, submit.",
 *   "sharedSteps": ["click `.vi-bookings-add-btn` — opens the add menu."],
 *   "specificSteps": ["click `//button[@data-entity='cx']` — Cx menu item."],
 *   "qengineShared": [
 *     "openURL(\"https://bookings.zoho.com/app/bookings\", \"same window\");",
 *     "click(\".vi-bookings-add-btn\");",
 *     "wait(2);",
 *     "// entity menu item goes here — specific, not shared",
 *     "wait(2);",
 *     "// entity fields go here — specific, not shared",
 *     "click(\".vi-qa-submit\");",
 *     "wait(2);"
 *   ]
 * }
 */

const fs = require("fs");
const path = require("path");

const SKILL_ROOT = path.resolve(__dirname, "..");
const DEFAULT_LEARNED = path.join(SKILL_ROOT, "learned");
const SECRET_KEY = /password|passwd|secret|token|cookie|authorization|api[_-]?key|credential/i;

function die(message, code) {
  process.stderr.write(message.replace(/\s+$/, "") + "\n");
  process.exit(code);
}

function parseArgs(argv) {
  const cmd = argv[2];
  const opts = {};
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) die(`Unexpected argument: ${arg}`, 1);
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  }
  return { cmd, opts };
}

function learnedRoot(opts) {
  return opts.root ? path.resolve(opts.root) : DEFAULT_LEARNED;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function slugProduct(product) {
  let value = String(product || "").trim();
  if (!value) die("Missing product.", 1);
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).host;
    } catch (err) {
      die(`Invalid product URL: ${product}`, 1);
    }
  }
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) die(`Cannot slug product: ${product}`, 1);
  return { product: value.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""), slug };
}

function parseAction(action) {
  const parts = String(action || "")
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length < 2) {
    die('Action must be a verb plus an entity, for example "add cx".', 1);
  }
  const verb = parts[0];
  const entity = parts.slice(1).join("-");
  return { verb, entity, action: `${verb}-${entity}` };
}

function rejectSecrets(value, trail) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => rejectSecrets(item, `${trail}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) {
        die(`Refusing to save secret field "${trail}.${key}".`, 1);
      }
      rejectSecrets(child, `${trail}.${key}`);
    }
  }
}

function readJson(opts) {
  let raw;
  if (opts.file) {
    raw = fs.readFileSync(path.resolve(opts.file), "utf8");
  } else {
    raw = fs.readFileSync(0, "utf8");
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    die(`Recipe JSON is not valid: ${err.message}`, 1);
  }
}

function listRecipeFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "README.md" && name !== "INDEX.md")
    .sort();
}

function numberedSteps(body) {
  return String(body || "")
    .split(/\r?\n/)
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, "").trim());
}

function fenced(body, lang) {
  const match = String(body || "").match(new RegExp("```" + lang + "\\r?\\n([\\s\\S]*?)```"));
  return match ? match[1].replace(/\s+$/, "") : "";
}

function parseRecipe(text) {
  const lines = text.split(/\r?\n/);
  const meta = {};
  let i = 0;
  if ((lines[0] || "").startsWith("# ")) i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) break;
    const match = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (match) meta[match[1].toLowerCase()] = match[2].trim();
  }
  const sections = {};
  let name = null;
  let buf = [];
  const flush = () => {
    if (name) sections[name] = buf.join("\n").trim();
  };
  for (; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      flush();
      name = lines[i].slice(3).trim().toLowerCase();
      buf = [];
    } else if (name) {
      buf.push(lines[i]);
    }
  }
  flush();
  return {
    product: meta.product || "",
    action: meta.action || "",
    verb: meta.verb || "",
    entity: meta.entity || "",
    pattern: meta.pattern || "",
    page: meta.page || "",
    learned: meta.learned || "",
    updated: meta.updated || "",
    reach: sections.reach || "",
    sharedSteps: numberedSteps(sections["shared steps"]),
    specificSteps: numberedSteps(sections["specific steps"]),
    qengineShared: fenced(sections["qengine shared block"], "java"),
    jsShared: fenced(sections["javascript shared block"], "javascript"),
  };
}

function loadProduct(root, productSlug) {
  const dir = path.join(root, productSlug);
  return listRecipeFiles(dir).map((name) => {
    const full = path.join(dir, name);
    const recipe = parseRecipe(fs.readFileSync(full, "utf8"));
    recipe.file = path.posix.join("learned", productSlug, name);
    recipe.jsFile = path.posix.join("learned", productSlug, name.replace(/\.md$/, ".js"));
    recipe.absFile = full;
    return recipe;
  });
}

function quote(value) {
  return JSON.stringify(String(value));
}

function hookName(comment) {
  const text = comment.toLowerCase();
  if (/menu|choose|item/.test(text)) return "menuItem";
  if (/field|fill|form|input/.test(text)) return "fields";
  return "specific";
}

function qengineLineToJs(line) {
  const text = line.trim();
  if (!text) return "";
  if (text.startsWith("//")) return text;
  let match = text.match(/^openURL\((["'])([\s\S]*?)\1,\s*(["'])([\s\S]*?)\3\);$/);
  if (match) return `await page.goto(${quote(match[2])});`;
  match = text.match(/^click\((["'])([\s\S]*?)\1\);$/);
  if (match) return `await page.locator(${quote(match[2])}).click();`;
  match = text.match(/^setValue\((["'])([\s\S]*?)\1,\s*(["'])([\s\S]*?)\3\);$/);
  if (match) return `await page.locator(${quote(match[2])}).fill(${quote(match[4])});`;
  match = text.match(/^wait\((\d+)\);$/);
  if (match) return `await page.waitForTimeout(${Number(match[1]) * 1000});`;
  match = text.match(/^select\((["'])([\s\S]*?)\1,\s*(["'])([\s\S]*?)\3,/);
  if (match) return `await page.locator(${quote(match[2])}).selectOption(${quote(match[4])});`;
  match = text.match(/^assertText\((["'])([\s\S]*?)\1,\s*(["'])([\s\S]*?)\3/);
  if (match) return `await expect(page.locator(${quote(match[2])})).toHaveText(${quote(match[4])});`;
  return `// unmapped QEngine step: ${text}`;
}

function buildJsSource(meta, qengineLines) {
  const counts = {};
  const body = [];
  for (const line of qengineLines) {
    const text = line.trim();
    if (text.startsWith("//") && /specific/i.test(text)) {
      let name = hookName(text);
      counts[name] = (counts[name] || 0) + 1;
      if (counts[name] > 1) name = `${name}${counts[name]}`;
      body.push(`  await call(${quote(name)}); ${text}`);
      continue;
    }
    const js = qengineLineToJs(line);
    if (js) body.push(`  ${js}`);
  }
  const rel = `learned/${meta.slug}/${meta.action}.md`;
  return `/**
 * Shared access path for ${meta.action} (pattern: ${meta.pattern}).
 * Source: ${rel}
 *
 * Reuse for another entity on the same pattern:
 *
 *   const { runSharedPath } = require("./${meta.action}.js");
 *   await runSharedPath(page, {
 *     menuItem: async (page) => {},
 *     fields: async (page) => {},
 *   });
 */
"use strict";

async function runSharedPath(page, specific = {}) {
  const call = async (name) => {
    const fn = specific[name];
    if (typeof fn === "function") await fn(page);
  };
${body.join("\n")}
}

module.exports = {
  runSharedPath,
  meta: {
    action: ${quote(meta.action)},
    pattern: ${quote(meta.pattern)},
    page: ${quote(meta.page)},
    product: ${quote(meta.product)},
  },
};
`;
}

function stripReuseComment(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\/\/ reused from learned\//.test(line.trim()))
    .join("\n")
    .trim();
}

function numbered(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

function renderMarkdown(meta, previous) {
  const comment = `// reused from learned/${meta.slug}/${meta.action}.md (shared path)`;
  const qengine = [comment, ...meta.qengineLines.filter((line) => line.trim() !== comment)].join("\n");
  const js = meta.jsSource.trimEnd();
  let previousBlock = "";
  if (previous) {
    previousBlock = `

## previous

Shared path replaced on ${meta.updated}. Earlier shared steps:

${numbered(previous.sharedSteps)}

\`\`\`java
${previous.qengineShared}
\`\`\`
`;
  }
  return `# ${meta.action}

product: ${meta.product}
action: ${meta.action}
verb: ${meta.verb}
entity: ${meta.entity}
pattern: ${meta.pattern}
page: ${meta.page}
learned: ${meta.learned}
updated: ${meta.updated}

## Reach

${meta.reach}

## Shared steps

These steps are the shell. Reuse them for any other \`${meta.verb}\` action with pattern \`${meta.pattern}\` on this product.

${numbered(meta.sharedSteps)}

## Specific steps

Only for ${meta.entity}. Do not copy these onto another entity.

${numbered(meta.specificSteps)}

## QEngine shared block

\`\`\`java
${qengine}
\`\`\`

## JavaScript shared block

\`\`\`javascript
${js}
\`\`\`

## How to reuse for a new entity

1. Copy every shared step, including the QEngine shared block and \`runSharedPath\` in \`${meta.action}.js\`.
2. In the browser, confirm the shared controls are still present.
3. Pass only the new entity's menu item and fields through the \`specific\` hooks.
4. Leave this comment on reused QEngine lines:
   \`${comment}\`
${previousBlock}`;
}

function renderIndex(product, recipes) {
  const blocks = recipes.map((recipe) => {
    const summary = (recipe.reach || recipe.sharedSteps[0] || "").replace(/\s+/g, " ").trim();
    return [
      `- action: ${recipe.action}`,
      `  pattern: ${recipe.pattern}`,
      `  file: ${recipe.action}.md`,
      `  js: ${recipe.action}.js`,
      `  shared: ${summary}`,
    ].join("\n");
  });
  return `# Learned flows — ${product}\n\n${blocks.join("\n\n")}\n`;
}

function asLines(value, label) {
  if (Array.isArray(value)) return value.map((line) => String(line));
  if (typeof value === "string") return value.split(/\r?\n/);
  die(`${label} must be an array of lines or a string.`, 1);
}

function saveRecipe(opts) {
  const input = readJson(opts);
  rejectSecrets(input, "recipe");
  if (input.passed !== true) {
    die("Refusing to save a recipe because passed is not true.", 1);
  }
  const required = ["product", "verb", "entity", "pattern", "page", "reach", "sharedSteps", "qengineShared"];
  for (const key of required) {
    if (input[key] === undefined || input[key] === "") die(`Missing ${key}.`, 1);
  }
  const { product, slug } = slugProduct(input.product);
  const verb = String(input.verb).trim().toLowerCase();
  const entity = String(input.entity).trim().toLowerCase().replace(/\s+/g, "-");
  const action = `${verb}-${entity}`;
  const sharedSteps = asLines(input.sharedSteps, "sharedSteps").map((s) => s.trim()).filter(Boolean);
  const specificSteps = asLines(input.specificSteps || [], "specificSteps").map((s) => s.trim()).filter(Boolean);
  if (sharedSteps.length === 0) die("sharedSteps is empty.", 1);
  const qengineLines = asLines(input.qengineShared, "qengineShared");
  const dir = path.join(learnedRoot(opts), slug);
  fs.mkdirSync(dir, { recursive: true });
  const mdPath = path.join(dir, `${action}.md`);
  const jsPath = path.join(dir, `${action}.js`);
  let learnedOn = today();
  let previous = null;
  if (fs.existsSync(mdPath)) {
    const old = parseRecipe(fs.readFileSync(mdPath, "utf8"));
    if (old.learned) learnedOn = old.learned;
    const oldShared = old.sharedSteps.join("\n");
    const oldQe = stripReuseComment(old.qengineShared);
    const newQe = stripReuseComment(qengineLines.join("\n"));
    if (oldShared !== sharedSteps.join("\n") || oldQe !== newQe) {
      previous = old;
    }
  }
  const meta = {
    product,
    slug,
    action,
    verb,
    entity,
    pattern: String(input.pattern).trim(),
    page: String(input.page).trim(),
    reach: String(input.reach).trim(),
    learned: learnedOn,
    updated: today(),
    sharedSteps,
    specificSteps,
    qengineLines,
  };
  meta.jsSource = typeof input.jsShared === "string" && input.jsShared.trim()
    ? input.jsShared.trim()
    : buildJsSource(meta, qengineLines);
  fs.writeFileSync(mdPath, renderMarkdown(meta, previous));
  fs.writeFileSync(jsPath, meta.jsSource.endsWith("\n") ? meta.jsSource : meta.jsSource + "\n");
  const recipes = loadProduct(learnedRoot(opts), slug);
  fs.writeFileSync(path.join(dir, "INDEX.md"), renderIndex(product, recipes));
  process.stdout.write(JSON.stringify({
    ok: true,
    wrote: {
      markdown: path.posix.join("learned", slug, `${action}.md`),
      javascript: path.posix.join("learned", slug, `${action}.js`),
      index: path.posix.join("learned", slug, "INDEX.md"),
    },
  }, null, 2) + "\n");
}

function publicRecipe(recipe, reuse) {
  const comment = `// reused from ${recipe.file} (shared path)`;
  const out = {
    action: recipe.action,
    pattern: recipe.pattern,
    page: recipe.page,
    file: recipe.file,
    jsFile: recipe.jsFile,
    reach: recipe.reach,
    sharedSteps: recipe.sharedSteps,
    qengineShared: recipe.qengineShared,
    jsShared: recipe.jsShared,
    comment,
  };
  if (reuse === "all") out.specificSteps = recipe.specificSteps;
  return out;
}

function matchRecipe(opts) {
  if (!opts.product || !opts.action) die("match requires --product and --action.", 1);
  const { slug } = slugProduct(opts.product);
  const query = parseAction(opts.action);
  const pattern = opts.pattern ? String(opts.pattern).trim() : "";
  const recipes = loadProduct(learnedRoot(opts), slug);
  const exact = recipes.find((recipe) => recipe.action === query.action);
  if (exact) {
    process.stdout.write(JSON.stringify({
      ok: true,
      match: "exact",
      reuse: "all",
      action: query.action,
      source: publicRecipe(exact, "all"),
    }, null, 2) + "\n");
    return;
  }
  let pool = recipes.filter((recipe) => recipe.verb === query.verb);
  if (pattern) pool = pool.filter((recipe) => recipe.pattern === pattern);
  const patterns = [...new Set(pool.map((recipe) => recipe.pattern))];
  if (pool.length === 0) {
    process.stdout.write(JSON.stringify({
      ok: true,
      match: "none",
      reuse: "none",
      action: query.action,
      explore: true,
    }, null, 2) + "\n");
    process.exit(2);
  }
  if (!pattern && patterns.length > 1) {
    process.stdout.write(JSON.stringify({
      ok: true,
      match: "ambiguous",
      reuse: "none",
      action: query.action,
      candidates: pool.map((recipe) => ({
        action: recipe.action,
        pattern: recipe.pattern,
        file: recipe.file,
      })),
    }, null, 2) + "\n");
    return;
  }
  const source = pool[0];
  process.stdout.write(JSON.stringify({
    ok: true,
    match: "pattern",
    reuse: "shared",
    action: query.action,
    delta: `Discover only the menu item and fields for ${query.action}. Call runSharedPath from ${source.jsFile} for the shared path.`,
    source: publicRecipe(source, "shared"),
  }, null, 2) + "\n");
}

function listRecipes(opts) {
  if (!opts.product) die("list requires --product.", 1);
  const { product, slug } = slugProduct(opts.product);
  const recipes = loadProduct(learnedRoot(opts), slug);
  process.stdout.write(JSON.stringify({
    ok: true,
    product,
    slug,
    recipes: recipes.map((recipe) => ({
      action: recipe.action,
      verb: recipe.verb,
      entity: recipe.entity,
      pattern: recipe.pattern,
      file: recipe.file,
      jsFile: recipe.jsFile,
    })),
  }, null, 2) + "\n");
}

function help() {
  process.stdout.write(`Usage:
  node scripts/learn_recipe.js match --product <url-or-name> --action "<verb entity>" [--pattern <name>] [--root <dir>]
  node scripts/learn_recipe.js save --file <recipe.json> [--root <dir>]
  node scripts/learn_recipe.js list --product <url-or-name> [--root <dir>]

match exit 2: no reusable recipe. Explore that case in the browser.
save writes learned/<product>/<action>.md, the .js module, and INDEX.md.
`);
}

function main() {
  const { cmd, opts } = parseArgs(process.argv);
  if (!cmd || cmd === "help" || opts.help) {
    help();
    return;
  }
  if (cmd === "match") return matchRecipe(opts);
  if (cmd === "save") return saveRecipe(opts);
  if (cmd === "list") return listRecipes(opts);
  die(`Unknown command: ${cmd}`, 1);
}

main();
