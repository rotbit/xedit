// Type table and first-line parsing for Obsidian-style callouts.
//
// Why a standalone pure module: the editor (live rendering) and markdown-it (preview/copy) pipelines
// must agree on the same type names, aliases and default titles; if either side recognizes one alias more or less,
// users get mismatches like "a callout in the editor that turns into a plain blockquote when copied".
// Nothing render-layer is imported here, so both sides can use it safely.

export interface CalloutStyle {
  /** Default Chinese title used when none is written */
  title: string;
  /** Semantic accent color: left border, title text */
  color: string;
  /** Semantic background color */
  background: string;
}

/**
 * Supported types. Colors are hardcoded rather than CSS variables: copying to WeChat inlines styles
 * (see lib/copy/inline.ts), and var() has no value at inlining time, so the whole declaration would be dropped.
 */
// Default titles end up in the preview and in content copied to WeChat, so they're content format and stay Chinese for now
export const CALLOUT_TYPES: Record<string, CalloutStyle> = {
  note: { title: "备注", color: "#4a6a85", background: "#f3f6fa" }, // i18n-ignore
  tip: { title: "提示", color: "#2f8f5b", background: "#eef8f2" }, // i18n-ignore
  info: { title: "信息", color: "#2b7cd3", background: "#eef4fd" }, // i18n-ignore
  warning: { title: "注意", color: "#c77700", background: "#fff7e8" }, // i18n-ignore
  danger: { title: "危险", color: "#d0453b", background: "#fdf0ee" }, // i18n-ignore
  question: { title: "疑问", color: "#7b57c6", background: "#f4f0fb" }, // i18n-ignore
  quote: { title: "引用", color: "#6b6b6b", background: "#f5f5f5" }, // i18n-ignore
  example: { title: "示例", color: "#4f5bd5", background: "#eff0fc" }, // i18n-ignore
  success: { title: "完成", color: "#2f8f5b", background: "#eef8f2" }, // i18n-ignore
};

/** Alias → canonical type: matches Obsidian's syntax so content pasted from Obsidian needs no changes */
const CALLOUT_ALIASES: Record<string, string> = {
  hint: "tip",
  important: "info",
  caution: "warning",
  attention: "warning",
  error: "danger",
  bug: "danger",
  failure: "danger",
  help: "question",
  faq: "question",
  cite: "quote",
  check: "success",
  done: "success",
};

/** Unknown types fall back to note: better to render a normal callout than degrade the whole block to a quote and make users think the syntax is wrong */
export const DEFAULT_CALLOUT_TYPE = "note";

export function resolveCalloutType(raw: string): string {
  const key = raw.trim().toLowerCase();
  const name = CALLOUT_ALIASES[key] ?? key;
  return name in CALLOUT_TYPES ? name : DEFAULT_CALLOUT_TYPE;
}

export function calloutStyle(type: string): CalloutStyle {
  return CALLOUT_TYPES[type] ?? CALLOUT_TYPES[DEFAULT_CALLOUT_TYPE];
}

export interface CalloutHead {
  /** Normalized type name (aliases resolved, unknown types fall back to note) */
  type: string;
  /** Display title: the user's own if written, otherwise the type's default title */
  title: string;
  /** Whether the user wrote a custom title -- the editor uses this to decide between handing the title to the badge or keeping the original text */
  custom: boolean;
  /** End index of the `[!type]` marker in the input text (excluding trailing spaces); the editor uses it to locate the replacement range */
  markEnd: number;
}

// `[!tip]`, `[!TIP]+` and `[!tip]- Title` are all recognized. The trailing +/- is Obsidian's fold toggle;
// we don't fold, but must recognize it, or folded callouts copied from Obsidian would degrade into plain quotes.
const HEAD_RE = /^\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-]?)[ \t]*(.*)$/;

/**
 * Parses a callout's first line (text with the `>` and following whitespace already stripped); returns null if it's not a callout.
 * Only looks at one line: the caller splits on newlines itself (on the markdown-it side the first paragraph may carry following body text).
 */
export function parseCalloutHead(line: string): CalloutHead | null {
  const m = HEAD_RE.exec(line);
  if (!m) return null;
  const type = resolveCalloutType(m[1]);
  const custom = m[3].trim();
  return {
    type,
    title: custom || calloutStyle(type).title,
    custom: custom.length > 0,
    // The `[!` and `]` around m[1] are 3 characters, plus the optional fold toggle
    markEnd: m[1].length + 3 + m[2].length,
  };
}
