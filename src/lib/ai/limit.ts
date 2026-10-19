/**
 * Rate limiting for the path that uses the site's key. Users with their own key skip this -- it's their money, they can run as much as they like.
 *
 * Reuses the cover generation counters (same in-process memory, same "one at a time + N per day" rules),
 * but keeps separate tallies: reviewing an article and generating an image shouldn't eat into each other's quota.
 * Multi-instance deployments would need Redis/a database here too; see the top of coverGenerate/limit for why.
 */
import { createCoverLimiter } from "@/lib/coverGenerate/limit";

const DEFAULT_DAILY_LIMIT = 30;

/** Max runs per account per calendar day (admin can set a per-account quota); missing or invalid values default to 30 */
export function aiDailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

/** The shared instance used by routes */
export const aiLimiter = createCoverLimiter();
