/**
 * Data contract for "AI article review".
 *
 * The UI only knows these three structures, provided by /api/ai/review (see parseReviewResult in lib/ai/reviewPrompt.ts).
 * Issue categories come with the result itself (categories); the frontend doesn't hardcode "grammar / wordiness / ..."
 * since each review type has an entirely different set (wording review checks grammar, compliance review checks follow-baiting).
 */

import type { ReviewKind } from "@/lib/ai/reviewKinds";

export interface ReviewCategory {
  id: string;
  label: string;
  /** Hex color for the body marks and the type tag on cards (brightened by the frontend at night, see editorMarks.ts) */
  color: string;
}

export interface ReviewItem {
  id: string;
  /** ReviewCategory.id */
  category: string;
  /** Original snippet, taken verbatim from the body's plain text: location relies entirely on it, not character offsets */
  quote: string;
  /** Approximate editor line number (0-based, same convention as data-line in the rendered output), only a hint */
  line: number;
  /** One-sentence description of the issue */
  problem: string;
  /** Suggested replacement text (replaces quote); if absent it's just a remark and the card shows no 「采纳」 (Accept) */
  suggestion?: string;
}

export interface ReviewResult {
  summary: string;
  categories: ReviewCategory[];
  items: ReviewItem[];
}

/**
 * A comment's current status. Apart from the two pure user actions 「忽略 / 知道了」 (Ignore / Got it),
 * everything is derived live from the current body (see deriveStatus in status.ts):
 * when the body is edited or undone, status follows, with no separate copy that can drift.
 */
export type ReviewStatus =
  /** Still awaiting the author: highlighted, included in previous/next */
  | "open"
  /** Accepted: quote gone from the body, suggestion in its place */
  | "accepted"
  /** Clicked 「知道了」 (Got it) (for comments with no suggestion to accept) */
  | "acked"
  /** Clicked 「忽略」 (Ignore) */
  | "ignored"
  /** Original edited: quote can't be found in the body, and it doesn't look like acceptance caused it */
  | "stale";

/** Actions the user took on a comment. 「采纳」 (Accept) isn't recorded here since it can be derived from the body */
export type ReviewAction = "ignored" | "acked";

/** Comment + its current status; this is what the UI receives */
export interface ReviewItemView extends ReviewItem {
  status: ReviewStatus;
}

/** Where this review run is at */
export type ReviewPhase = "idle" | "loading" | "done" | "error";

/** One review run in history: enough to identify it (the full result is fetched separately by id, see history.ts) */
export interface ReviewRecordMeta {
  id: string;
  /** ISO time */
  createdAt: string;
  kinds: ReviewKind[];
  /** Model used at the time, e.g. deepseek/deepseek-chat */
  model: string;
  /** Total comments in this run */
  total: number;
}
