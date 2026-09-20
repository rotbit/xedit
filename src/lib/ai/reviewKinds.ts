/**
 * 审核类型目录：这一趟审的是「文章表述」还是「公众号规则」。
 *
 * 纯数据，没有提示词也没有服务端的东西——网页那边（启动面板、审核条上的胶囊）
 * 要拿它列选项，服务端要拿它挑提示词与分类。提示词本身长在 reviewPrompt.ts，
 * 网页不 import 那一份，免得把几千字的系统提示打进前端包里。
 */

export type ReviewKind = "expression" | "wechat_rules";

export interface ReviewKindSpec {
  id: ReviewKind;
  /** 面板上显示的名字 */
  label: string;
  /** 一句话说这一类看的是什么，让人不必猜 */
  description: string;
}

export const REVIEW_KINDS: ReviewKindSpec[] = [
  {
    id: "expression",
    label: "表述审核",
    description: "逐句看表达：啰嗦、说不清、用词不当，给得出改法的可一键采纳",
  },
  {
    id: "wechat_rules",
    label: "公众号合规审核",
    description: "对照公众号平台规则：标题党、诱导分享关注、夸大与绝对化用语、敏感内容风险",
  },
];

/** 没选过的时候审哪一类：绝大多数人点「审核」是想让人给文章挑毛病 */
export const DEFAULT_REVIEW_KIND: ReviewKind = "expression";

const BY_ID = new Map(REVIEW_KINDS.map((k) => [k.id, k]));

/** 认不认这个审核类型 id（本机设置与接口入参都要过这一关） */
export function isReviewKind(value: unknown): value is ReviewKind {
  return typeof value === "string" && BY_ID.has(value as ReviewKind);
}

/** 取一类；认不出一律 null，由调用方决定报错还是落回默认 */
export function reviewKind(value: unknown): ReviewKindSpec | null {
  return isReviewKind(value) ? (BY_ID.get(value) ?? null) : null;
}

/**
 * 一趟可以同时审几类（多选）。把随便什么输入洗成一份干净的清单：
 * 只留认识的、去重、按目录顺序排；一个都不剩就落回默认那一类——永远不会是空的。
 */
export function cleanReviewKinds(value: unknown): ReviewKind[] {
  const picked = new Set(Array.isArray(value) ? value.filter(isReviewKind) : []);
  const kinds = REVIEW_KINDS.map((k) => k.id).filter((id) => picked.has(id));
  return kinds.length > 0 ? kinds : [DEFAULT_REVIEW_KIND];
}

/** 几类一起审时的名字：「表述审核 + 公众号合规审核」 */
export function reviewKindsLabel(kinds: readonly ReviewKind[]): string {
  return kinds.map((k) => reviewKindLabel(k)).join(" + ");
}

/** 界面上那几处文案（胶囊、加载态）要的名字 */
export function reviewKindLabel(value: unknown): string {
  return reviewKind(value)?.label ?? reviewKind(DEFAULT_REVIEW_KIND)!.label;
}
