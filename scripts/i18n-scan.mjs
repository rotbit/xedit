#!/usr/bin/env node
/**
 * 扫出 src 里还没交给 t() 的中文界面文案。
 *
 *   npm run i18n:scan            列出 path:line  文本，末尾按目录汇总
 *   npm run i18n:scan -- --json  同样的结果输出成 JSON
 *   npm run i18n:scan -- --unused 列出英文字典里在 src 中已找不到的 key（中文改了、字典没跟上）
 *
 * 用 TypeScript 编译器解析而不是正则：注释天然跳过，模板字符串、JSX 文本也能分清。
 * 跳过：t()/tk()/translate() 的第一个参数（已接管）、类型位置的字面量、console.* 的参数、
 * 所在行或上一行带 `i18n-ignore` 注释的（数据而非文案，比如日期标签、保留分类名）。
 * 模块顶层常量里用 t() 会让语言切换失效，这个脚本查不出来，靠人看。
 * 退出码恒为 0：现在只是清单，还不是 CI 门槛。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const DICT_DIR = path.join(SRC, "i18n", "en");

/** 不在本轮范围内的目录 / 文件（相对仓库根，前缀匹配） */
const SKIP = [
  "src/i18n/", // 字典本身
  "src/features/landing/", // 落地页保持中文
  "src/features/changelog/", // 更新日志数据
  "src/app/about/",
  "src/app/changelog/",
  "src/app/themes/", // 主题样张落地页
  "src/app/s/", // 公开分享页
  "src/app/gold/", // 内部小工具，与产品无关
  "src/app/layout.tsx", // 只有 metadata（SEO 保持中文）
  "src/app/robots.ts",
  "src/app/sitemap.ts",
  "src/lib/site.ts", // 站点 SEO 文案
  "src/lib/welcomeDoc.ts", // 欢迎稿正文，属于内容，后置
  "src/lib/ai/reviewPrompt.ts", // AI 提示词，后置
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
    // console.warn(...) 之类：拿到 "console.warn"
    return ts.isIdentifier(e.expression) ? `${e.expression.text}.${e.name.text}` : e.name.text;
  }
  return "";
}

/** 这个字面量是否已经被接管或不需要翻译 */
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

/** 遍历一个文件里所有字符串片段：字面量、模板字符串（拼成一段，插值写成 ${…}）、JSX 文本 */
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
      // 模板字符串里嵌着的表达式可能还有字面量，继续往下走；其余字面量没有子节点
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

/** 汇总口径：取所在目录的前三段（src/features/editor、src/lib/todos），src/components 这类就两段 */
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
  // src 里出现过的所有字符串片段（含已被 t() 包住的）；字典 key 必须原样出现过才算在用
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
