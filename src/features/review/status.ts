/**
 * What state a comment is in right now, derived from the body itself as much as possible rather than a separate copy that drifts.
 *
 * Only 「忽略」 (Ignore) and 「知道了」 (Got it) are pure user actions and must be recorded; 「采纳」 (Accept) isn't:
 * accepting replaces quote with suggestion, so "quote not found, suggestion in its place"
 * is itself the evidence of acceptance. That way after ⌘Z undo, the comment comes back to life as soon as the quote returns.
 */

import { locateInSource, type SourceSpan } from "./locate";
import type { ReviewAction, ReviewItem, ReviewStatus } from "./types";

/**
 * Where this comment's quote currently is in the source, in the "still awaiting action" sense.
 *
 * Suggestions often just add a few characters to the quote (「正确」→「正确性」), so after accepting, the quote is still found,
 * but now sitting inside the suggestion. That case doesn't count as "still there", otherwise the accept button would stay lit
 * and each press would append another 「性」.
 */
export function locateQuote(item: ReviewItem, source: string): SourceSpan | null {
  const span = locateInSource(source, item.quote, item.line);
  if (!span) return null;
  const { suggestion } = item;
  if (suggestion && suggestion !== item.quote && suggestion.includes(item.quote)) {
    const done = locateInSource(source, suggestion, item.line);
    if (done && done.from <= span.from && span.to <= done.to) return null;
  }
  return span;
}

export function deriveStatus(
  item: ReviewItem,
  source: string,
  action?: ReviewAction
): ReviewStatus {
  if (action === "ignored") return "ignored";
  if (locateQuote(item, source)) {
    return action === "acked" ? "acked" : "open";
  }
  // The quote is gone: was it replaced by the suggestion (accepted), or did the author edit it (stale)?
  if (item.suggestion && locateInSource(source, item.suggestion, item.line)) return "accepted";
  return "stale";
}

/** Still awaiting the author: only these get highlights, take part in previous/next, and count toward categories */
export function isOpen(status: ReviewStatus): boolean {
  return status === "open";
}

/** Handled (the 「已处理 M」 (M handled) in the top bar count) */
export function isHandled(status: ReviewStatus): boolean {
  return status === "accepted" || status === "acked" || status === "ignored";
}
