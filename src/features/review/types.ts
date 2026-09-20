/**
 * 「AI 文章审核」的数据契约。
 *
 * 界面只认这三个结构，由 /api/ai/review 给（见 lib/ai/reviewPrompt.ts 的 parseReviewResult）。
 * 有哪些问题类型由结果自己带（categories），前端不写死「语病/啰嗦/…」这几种——
 * 审核类型不同，整套分类都不一样（表述审核看语病，合规审核看诱导关注）。
 */

export interface ReviewCategory {
  id: string;
  label: string;
  /** 十六进制色值，画正文里的标注与卡片上的类型标签用（夜间由前端提亮，见 editorMarks.ts） */
  color: string;
}

export interface ReviewItem {
  id: string;
  /** ReviewCategory.id */
  category: string;
  /** 原文片段，逐字取自正文的纯文本：定位全靠它，不靠字符偏移 */
  quote: string;
  /** 大致所在的编辑器行号（0 基，与渲染结果里的 data-line 同一口径），只当提示用 */
  line: number;
  /** 一句话说问题 */
  problem: string;
  /** 建议改成的文字（替换 quote）；没有就只是提个意见，卡片上不出现「采纳」 */
  suggestion?: string;
}

export interface ReviewResult {
  summary: string;
  categories: ReviewCategory[];
  items: ReviewItem[];
}

/**
 * 一条意见此刻的状态。除了「忽略 / 知道了」这两个纯粹的用户动作，
 * 其余都是从当前正文里现推出来的（见 status.ts 的 deriveStatus）：
 * 正文改了、撤销了，状态跟着回去，不必另存一份随时会走样的副本。
 */
export type ReviewStatus =
  /** 还等着作者处理：上高亮、进上一条/下一条 */
  | "open"
  /** 已采纳：正文里 quote 没了、suggestion 在原处 */
  | "accepted"
  /** 点过「知道了」（没有建议可采纳的那种意见） */
  | "acked"
  /** 点过「忽略」 */
  | "ignored"
  /** 原文已修改：quote 在正文里找不到了，也不像是采纳造成的 */
  | "stale";

/** 用户对某条意见做过的动作。「采纳」不记在这里——它从正文本身就能推出来 */
export type ReviewAction = "ignored" | "acked";

/** 意见 + 它此刻的状态，界面拿到的就是这个 */
export interface ReviewItemView extends ReviewItem {
  status: ReviewStatus;
}

/** 审核这一趟走到哪了 */
export type ReviewPhase = "idle" | "loading" | "done" | "error";
