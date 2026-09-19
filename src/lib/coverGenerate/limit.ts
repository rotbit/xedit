/**
 * AI 生成封面的限流。生图按张付费，花的是站点自己的 Replicate 账户，所以要挡两件事：
 * 连点几下同时跑好几张，以及一个账号一天把额度刷光。
 *
 * 状态只在进程内存里：本站是单实例 docker 部署（docker-compose.yml 只起一个 app 容器），
 * 一份内存状态就够。哪天要多实例横向扩，这里得换成 Redis/数据库，否则每个实例各限各的，
 * 实际额度按实例数翻倍。
 */

/** 拿到名额时带上收工回调，拿不到时说明是哪道闸拦的 */
export type CoverSlot =
  | { ok: true; release: () => void }
  | { ok: false; reason: "busy" | "rate_limited" };

/** 东八区日期串 YYYY-MM-DD。口径与 lib/active 的 chinaDate 一致，
 *  不直接 import 是因为那个模块连着 prisma，限流这点事不该把数据库拖进来 */
function dayOf(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 时钟可注入，方便单测把日子拨过去 */
export function createCoverLimiter(now: () => number = Date.now) {
  /** 正在生成的账号 */
  const running = new Set<string>();
  /** 今天各账号用掉几次；跨天整体作废，顺带把不再来的人清掉（与 lib/active 的 markedDate 一个路子） */
  const used = new Map<string, number>();
  let day = "";

  return {
    /**
     * 占一个名额。拿到就计一次数——调用方紧接着就会真去调上游，而花钱的正是那一步，
     * 所以失败也照样算数，否则重试能把限额绕过去。被拦下的请求不计数。
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

/** 路由共用的那一份 */
export const coverLimiter = createCoverLimiter();
