/**
 * Review kind catalog: whether this run reviews "writing" or "WeChat Official Account rules".
 *
 * Pure data, no prompts or server code -- the web side (launch panel, pill on the review bar)
 * lists options from it, and the server picks prompts and categories from it. The prompts themselves live in reviewPrompt.ts,
 * which the web doesn't import, so thousands of characters of system prompt stay out of the frontend bundle.
 */
import { tk } from "@/i18n/t";

export type ReviewKind = "expression" | "wechat_rules";

export interface ReviewKindSpec {
  id: ReviewKind;
  /** Name shown in the panel */
  label: string;
  /** One sentence on what this kind looks at, so nobody has to guess */
  description: string;
}

export const REVIEW_KINDS: ReviewKindSpec[] = [
  {
    id: "expression",
    label: tk("表述审核"),
    description: tk("逐句看表达：啰嗦、说不清、用词不当，给得出改法的可一键采纳"),
  },
  {
    id: "wechat_rules",
    label: tk("公众号合规审核"),
    description: tk("对照公众号平台规则：标题党、诱导分享关注、夸大与绝对化用语、敏感内容风险"),
  },
];

/** Which kind to review when nothing has been chosen: most people clicking "review" want their writing critiqued */
export const DEFAULT_REVIEW_KIND: ReviewKind = "expression";

const BY_ID = new Map(REVIEW_KINDS.map((k) => [k.id, k]));

/** Whether this review kind id is recognized (both local settings and API inputs go through this check) */
export function isReviewKind(value: unknown): value is ReviewKind {
  return typeof value === "string" && BY_ID.has(value as ReviewKind);
}

/** Gets a kind; unknown ids return null, and the caller decides whether to error or fall back to the default */
export function reviewKind(value: unknown): ReviewKindSpec | null {
  return isReviewKind(value) ? (BY_ID.get(value) ?? null) : null;
}

/**
 * A run can review several kinds at once (multi-select). Sanitizes any input into a clean list:
 * known ids only, deduped, in catalog order; if none remain, fall back to the default kind -- it's never empty.
 */
export function cleanReviewKinds(value: unknown): ReviewKind[] {
  const picked = new Set(Array.isArray(value) ? value.filter(isReviewKind) : []);
  const kinds = REVIEW_KINDS.map((k) => k.id).filter((id) => picked.has(id));
  return kinds.length > 0 ? kinds : [DEFAULT_REVIEW_KIND];
}

/**
 * Name for several kinds reviewed together, e.g. 「表述审核 + 公众号合规审核」 (writing review + WeChat compliance review).
 * UI callers pass the component's t to translate into the current language; without it you get the Chinese original (which the server needs for prompts).
 */
export function reviewKindsLabel(kinds: readonly ReviewKind[], tr: (zh: string) => string = (s) => s): string {
  return kinds.map((k) => tr(reviewKindLabel(k))).join(" + ");
}

/** Chinese name of a kind (label stores the original; prompts use it directly, the UI runs it through t()) */
export function reviewKindLabel(value: unknown): string {
  return reviewKind(value)?.label ?? reviewKind(DEFAULT_REVIEW_KIND)!.label;
}
