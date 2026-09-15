// Obsidian 式提示块（Callout）的类型表与首行解析。
//
// 为什么单独成一个纯模块：编辑器（即时渲染）、markdown-it（预览/复制）两条管线
// 必须认同一套类型名、别名与默认标题，任何一边多认或少认一个别名，
// 用户就会看到「编辑器里是提示块、复制出去变普通引用」这种对不上的结果。
// 这里不 import 任何渲染层依赖，两边都能安全引用。

export interface CalloutStyle {
  /** 未写标题时用的默认中文标题 */
  title: string;
  /** 语义主色：左边框、标题文字 */
  color: string;
  /** 语义底色 */
  background: string;
}

/**
 * 支持的类型表。色值写死而不用 CSS 变量：复制到公众号走的是样式内联
 * （见 lib/copy/inline.ts），内联那一刻 var() 取不到值，整条声明会被丢掉。
 */
export const CALLOUT_TYPES: Record<string, CalloutStyle> = {
  note: { title: "备注", color: "#4a6a85", background: "#f3f6fa" },
  tip: { title: "提示", color: "#2f8f5b", background: "#eef8f2" },
  info: { title: "信息", color: "#2b7cd3", background: "#eef4fd" },
  warning: { title: "注意", color: "#c77700", background: "#fff7e8" },
  danger: { title: "危险", color: "#d0453b", background: "#fdf0ee" },
  question: { title: "疑问", color: "#7b57c6", background: "#f4f0fb" },
  quote: { title: "引用", color: "#6b6b6b", background: "#f5f5f5" },
  example: { title: "示例", color: "#4f5bd5", background: "#eff0fc" },
  success: { title: "完成", color: "#2f8f5b", background: "#eef8f2" },
};

/** 别名 → 正式类型：与 Obsidian 的写法保持一致，用户从 Obsidian 粘过来不用改 */
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

/** 未知类型一律落到 note：宁可按普通提示块渲染，也不要整块退化成引用让用户以为语法错了 */
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
  /** 归一后的类型名（别名已解析，未知类型落到 note） */
  type: string;
  /** 显示标题：用户写了就用用户写的，没写用类型默认标题 */
  title: string;
  /** 用户是否写了自定义标题 —— 编辑器据此决定是把标题交给徽标还是保留原文 */
  custom: boolean;
  /** `[!type]` 记号在传入文本里的结束下标（不含其后空格），编辑器据此定位替换范围 */
  markEnd: number;
}

// `[!tip]`、`[!TIP]+`、`[!tip]- 标题` 都认。尾部的 +/- 是 Obsidian 的折叠开关，
// 我们不做折叠，但必须认得出来，否则从 Obsidian 抄来的折叠写法会整块退化成引用。
const HEAD_RE = /^\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-]?)[ \t]*(.*)$/;

/**
 * 解析提示块首行（已剥掉 `>` 与其后空白的那段文本），不是提示块返回 null。
 * 只看一行：正文里的换行由调用方自己切开（markdown-it 侧首段可能带着后续正文）。
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
    // m[1] 两侧的 `[!` `]` 共 3 字符，再加可选的折叠开关
    markEnd: m[1].length + 3 + m[2].length,
  };
}
