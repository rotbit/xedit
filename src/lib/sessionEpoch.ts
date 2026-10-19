/**
 * Session epoch: incremented on account switch, logout and mirror clear.
 * Every async persistence path records the epoch when it starts and discards the result if it changed on return,
 * so in-flight requests from the previous account never write into the next account's local state.
 */
let epoch = 1;

export function getSessionEpoch(): number {
  return epoch;
}

export function bumpSessionEpoch(): number {
  return ++epoch;
}

/** Record when starting an async operation; use it on return to decide whether the result still counts */
export function isCurrentEpoch(captured: number): boolean {
  return captured === epoch;
}
