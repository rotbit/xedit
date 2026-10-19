/**
 * Rate limiting for AI cover generation. Images are paid per image on the site's own Replicate account, so two things must be blocked:
 * a few rapid clicks running several images at once, and one account burning through the quota in a day.
 *
 * State lives only in process memory: the site is a single-instance docker deployment (docker-compose.yml starts one app container),
 * so one in-memory copy is enough. If we ever scale out to multiple instances, this must move to Redis/the database, or each instance
 * limits on its own and the effective quota multiplies by the instance count.
 */

/** On success, carries a release callback; on failure, says which gate blocked it */
export type CoverSlot =
  | { ok: true; release: () => void }
  | { ok: false; reason: "busy" | "rate_limited" };

/** UTC+8 date string YYYY-MM-DD. Same convention as chinaDate in lib/active;
 *  not imported directly because that module pulls in prisma, and rate limiting shouldn't drag the database in */
function dayOf(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Injectable clock so unit tests can advance the day */
export function createCoverLimiter(now: () => number = Date.now) {
  /** Accounts currently generating */
  const running = new Set<string>();
  /** Uses per account today; discarded wholesale on day rollover, which also clears out people who stopped coming (same approach as markedDate in lib/active) */
  const used = new Map<string, number>();
  let day = "";

  return {
    /**
     * Take a slot. Getting one counts as a use: the caller immediately hits the upstream, and that's the step that costs money,
     * so failures still count, otherwise retries could bypass the limit. Blocked requests aren't counted.
     */
    take(userId: string, limit: number): CoverSlot {
      const today = dayOf(now());
      if (today !== day) {
        day = today;
        used.clear();
      }
      if (running.has(userId)) return { ok: false, reason: "busy" };
      const count = used.get(userId) ?? 0;
      if (count >= limit) return { ok: false, reason: "rate_limited" };
      used.set(userId, count + 1);
      running.add(userId);
      return { ok: true, release: () => running.delete(userId) };
    },
  };
}

/** The single shared instance used by the routes */
export const coverLimiter = createCoverLimiter();
