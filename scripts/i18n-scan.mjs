#!/usr/bin/env node
/**
 * Find Chinese UI copy in src that hasn't been handed to t() yet.
 *
 *   npm run i18n:scan            list path:line  text, with a per-directory summary at the end
 *   npm run i18n:scan -- --json  same results as JSON
 *   npm run i18n:scan -- --unused list keys in the English dictionary no longer found in src (Chinese changed, dictionary didn't follow)
 *
 * Parses with the TypeScript compiler rather than regex: comments are naturally skipped, and template strings and JSX text are told apart.
 * Skips: the first argument of t()/tk()/translate() (already handled), literals in type positions, console.* arguments,
 * and anything with an `i18n-ignore` comment on the same or previous line (data, not copy, e.g. date labels, reserved category names).
 * Using t() in module-level constants breaks language switching; this script can't detect that, so it needs human review.
 * Exit code is always 0: it's just a list for now, not a CI gate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const DICT_DIR = path.join(SRC, "i18n", "en");

/** Directories / files out of scope for this round (relative to repo root, prefix match) */
const SKIP = [
  "src/i18n/", // the dictionary itself
  "src/features/landing/", // landing page stays in Chinese
  "src/features/changelog/", // changelog data
  "src/app/about/",
  "src/app/changelog/",
  "src/app/themes/", // theme sample landing page
  "src/app/s/", // public share page
  // The share page is for readers (who may not be logged in or have a language preference), so like the /s route it stays Chinese; the in-product ShareDialog is translated as usual
  "src/features/share/components/",
  "src/features/share/lib/",
  "src/features/share/hooks/", // hooks for share page reader annotations, also part of the public page
  "src/features/share/SharedArticle.tsx",
  "src/app/gold/", // internal utility, unrelated to the product
  "src/app/layout.tsx", // metadata only (SEO stays in Chinese)
  "src/app/robots.ts",
  "src/app/sitemap.ts",
  "src/lib/site.ts", // site SEO copy
  "src/lib/welcomeDoc.ts", // welcome doc body: content, deferred
  "src/lib/ai/reviewPrompt.ts", // AI prompts, deferred
  "src/app/api/mcp/route.ts", // MCP tool names/descriptions/errors are protocol text for AI clients, never shown in the web UI
];

const CJK = /[一-鿿　-〿＀-￯]/;
const T_CALLEES = new Set(["t", "tk", "translate"]);

const args = new Set(process.argv.slice(2));

function walkFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const skipped = (r) => SKIP.some((p) => r === p || r.startsWith(p));

function parse(file) {
  const text = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) {
    // e.g. console.warn(...): yields "console.warn"
    return ts.isIdentifier(e.expression) ? `${e.expression.text}.${e.name.text}` : e.name.text;
  }
  return "";
}

/** Whether this literal is already handled or needs no translation */
function exempt(node, sf, lines) {
  const parent = node.parent;
  if (parent && ts.isCallExpression(parent) && parent.arguments[0] === node && T_CALLEES.has(calleeName(parent))) {
    return true;
  }
  for (let p = parent; p; p = p.parent) {
    if (ts.isLiteralTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isCallExpression(p) && calleeName(p).startsWith("console.")) return true;
    if (ts.isStatement(p)) break;
  }
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  return /i18n-ignore/.test(lines[line] ?? "") || /i18n-ignore/.test(lines[line - 1] ?? "");
}

/** Walk every string fragment in a file: literals, template strings (joined into one, interpolations written as ${…}), JSX text */
function collect(sf, onHit) {
  const lines = sf.text.split("\n");
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node)) {
      text = node.head.text + node.templateSpans.map((s) => "${…}" + s.literal.text).join("");
    } else if (ts.isJsxText(node)) text = node.text.replace(/\s+/g, " ").trim();
    if (text !== null) {
      onHit(node, text, () => exempt(node, sf, lines));
      // Expressions embedded in template strings may contain more literals, so keep descending; other literals have no children
      if (!ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function scan() {
  const hits = [];
  for (const file of walkFiles(SRC)) {
    const r = rel(file);
    if (skipped(r)) continue;
    const sf = parse(file);
    collect(sf, (node, text, isExempt) => {
      if (!text || !CJK.test(text) || isExempt()) return;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      hits.push({ file: r, line, text });
    });
  }
  return hits;
}

/** Summary bucket: the first three segments of the directory (src/features/editor, src/lib/todos), or two for things like src/components */
function bucketOf(file) {
  return path.posix.dirname(file).split("/").slice(0, 3).join("/");
}

function dictKeys() {
  const keys = [];
  for (const name of fs.readdirSync(DICT_DIR)) {
    if (!name.endsWith(".ts") || name === "index.ts") continue;
    const sf = parse(path.join(DICT_DIR, name));
    const visit = (node) => {
      if (ts.isPropertyAssignment(node)) {
        const n = node.name;
        const key = ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null;
        if (key !== null) keys.push({ key, file: rel(sf.fileName) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return keys;
}

function unused() {
  // Every string fragment appearing in src (including ones already wrapped in t()); a dictionary key counts as used only if it appears verbatim
  const seen = new Set();
  for (const file of walkFiles(SRC)) {
    if (rel(file).startsWith("src/i18n/")) continue;
    collect(parse(file), (_node, text) => seen.add(text));
  }
  return dictKeys().filter(({ key }) => !seen.has(key));
}

if (args.has("--unused")) {
  const list = unused();
  if (args.has("--json")) console.log(JSON.stringify(list, null, 2));
  else {
    for (const { key, file } of list) console.log(`${file}  ${key}`);
    console.log(`\n${list.length} 条字典 key 在 src 中找不到`);
  }
} else {
  const hits = scan();
  const byDir = new Map();
  for (const h of hits) byDir.set(bucketOf(h.file), (byDir.get(bucketOf(h.file)) ?? 0) + 1);
  const summary = [...byDir.entries()].sort((a, b) => b[1] - a[1]);
  if (args.has("--json")) {
    console.log(JSON.stringify({ total: hits.length, byDir: Object.fromEntries(summary), hits }, null, 2));
  } else {
    for (const h of hits) console.log(`${h.file}:${h.line}  ${h.text}`);
    console.log(`\n未翻译 ${hits.length} 条，按目录：`);
    for (const [dir, n] of summary) console.log(`  ${String(n).padStart(5)}  ${dir}`);
  }
}
process.exitCode = 0;
