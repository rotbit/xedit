import { describe, expect, it } from "vitest";
import { createCoverLimiter } from "@/lib/coverGenerate/limit";

/** 时钟注入进去，日子随便拨 */
function limiterAt(start: number) {
  let now = start;
  return { limiter: createCoverLimiter(() => now), jump: (ms: number) => (now += ms) };
}

const DAY = 24 * 3600_000;
/** 2026-09-19 12:00 东八区 */
const NOON = Date.parse("2026-09-19T04:00:00.000Z");

describe("生封面限流", () => {
  it("同一个账号同时只能生一张，放掉才能再来", () => {
    const { limiter } = limiterAt(NOON);
    const first = limiter.take("u1", 10);
    expect(first.ok).toBe(true);
    expect(limiter.take("u1", 10)).toEqual({ ok: false, reason: "busy" });
    // 别人不受影响
    expect(limiter.take("u2", 10).ok).toBe(true);

    if (first.ok) first.release();
    expect(limiter.take("u1", 10).ok).toBe(true);
  });

  it("每天最多 N 次，超了是 rate_limited", () => {
    const { limiter } = limiterAt(NOON);
    for (let i = 0; i < 2; i++) {
      const slot = limiter.take("u1", 2);
      expect(slot.ok, `第 ${i + 1} 次`).toBe(true);
      if (slot.ok) slot.release();
    }
    expect(limiter.take("u1", 2)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("被拦下的请求不计次：撞上 busy 不该白扣一次额度", () => {
    const { limiter } = limiterAt(NOON);
    const first = limiter.take("u1", 2);
    expect(limiter.take("u1", 2)).toEqual({ ok: false, reason: "busy" }); // 这一次不算数
    if (first.ok) first.release();

    const second = limiter.take("u1", 2);
    expect(second.ok).toBe(true);
    if (second.ok) second.release();
    // 真正发起过的是两次，第三次才该被限额挡住
    expect(limiter.take("u1", 2)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("次数按东八区的自然日重置", () => {
    const { limiter, jump } = limiterAt(NOON);
    const slot = limiter.take("u1", 1);
    if (slot.ok) slot.release();
    expect(limiter.take("u1", 1)).toEqual({ ok: false, reason: "rate_limited" });

    // 还在同一天的 23:59（东八区）：照旧被挡
    jump(11 * 3600_000 + 59 * 60_000);
    expect(limiter.take("u1", 1)).toEqual({ ok: false, reason: "rate_limited" });
    // 跨过零点就重新开始
    jump(60_000);
    expect(limiter.take("u1", 1).ok).toBe(true);
  });

  it("跨天时把不再来的账号一起清掉，不留一屋子旧计数", () => {
    const { limiter, jump } = limiterAt(NOON);
    const old = limiter.take("u1", 1);
    if (old.ok) old.release();
    jump(DAY);
    expect(limiter.take("u2", 1).ok).toBe(true);
    // u1 昨天的计数没跟到今天来
    expect(limiter.take("u1", 1).ok).toBe(true);
  });

  it("限额配成 0 就是彻底关掉", () => {
    const { limiter } = limiterAt(NOON);
    expect(limiter.take("u1", 0)).toEqual({ ok: false, reason: "rate_limited" });
  });
});
