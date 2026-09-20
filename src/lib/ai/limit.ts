/**
 * 蹭站点 key 的那条路的限流。用户自带 key 不走这里——花自己的钱，爱跑几次跑几次。
 *
 * 复用生封面那套计数器（同一个进程内存、同一套「同时只跑一个 + 每天几次」口径），
 * 只是各记各的账：审一次文章和生一张图不该互相占额度。
 * 多实例部署时同样要换成 Redis/数据库，理由见 coverGenerate/limit 的开头。
 */
import { createCoverLimiter } from "@/lib/coverGenerate/limit";

const DEFAULT_DAILY_LIMIT = 30;

/** 每个管理员每个自然日最多跑几次；没配或填得不合法都按 30 */
export function aiDailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

/** 路由共用的那一份 */
export const aiLimiter = createCoverLimiter();
