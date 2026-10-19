/**
 * Inline mini diff for "original → suggestion": the card should show at a glance exactly which characters changed.
 *
 * Only trims the common prefix and suffix; the middle counts as "deleted A, replaced with B". Review comments are sentence-level rewrites anyway,
 * and the previous Myers implementation didn't show differences any better while being more code to maintain.
 */

export interface QuoteDiff {
  /** Unchanged start */
  prefix: string;
  /** Struck-out part (may be empty: pure insertion) */
  removed: string;
  /** Added part (may be empty: pure deletion) */
  added: string;
  /** Unchanged end */
  suffix: string;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

export function diffQuote(before: string, after: string): QuoteDiff {
  const max = Math.min(before.length, after.length);

  let head = 0;
  while (head < max && before[head] === after[head]) head++;
  // Don't split a surrogate pair (emoji and the like) down the middle
  if (head > 0 && isHighSurrogate(before.charCodeAt(head - 1))) head--;

  let tail = 0;
  while (
    tail < max - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  if (tail > 0 && isLowSurrogate(before.charCodeAt(before.length - tail))) tail--;

  return {
    prefix: before.slice(0, head),
    removed: before.slice(head, before.length - tail),
    added: after.slice(head, after.length - tail),
    suffix: tail ? before.slice(before.length - tail) : "",
  };
}
