// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 全站 AI 设置：模型由后台定，token 加密入库、后台填的压过环境变量，
 * 回显只给来源和末四位。库用一张内存表顶替。
 */
const table = vi.hoisted(() => new Map<string, string>());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteSetting: {
      findMany: async () => [...table].map(([key, value]) => ({ key, value })),
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        table.set(where.key, create.value);
      },
      deleteMany: async ({ where }: { where: { key: string } }) => {
        table.delete(where.key);
      },
    },
  },
}));

import { aiProvider } from "@/lib/ai/providers";
import {
  AI_KEY_SLOTS,
  aiKeyStatuses,
  aiReviewReady,
  getReviewModel,
  parseReviewModel,
  setAiKey,
  setReviewModel,
  siteAiKey,
} from "@/lib/ai/siteSettings";

const FAKE = "sk-test-not-a-real-key-9f3a";
const deepseek = aiProvider("deepseek")!;

beforeEach(async () => {
  process.env.AUTH_SECRET = "unit-test-secret";
  for (const slot of AI_KEY_SLOTS) delete process.env[slot];
  // 走 setAiKey 清表，顺带把模块里的缓存作废
  table.clear();
  await setAiKey(deepseek.envKey, "");
});

describe("审核用哪个模型", () => {
  it("后台没设过就是 DeepSeek 的默认模型", async () => {
    expect(await getReviewModel()).toEqual({ provider: "deepseek", model: deepseek.models[0] });
  });

  it("库里那段认不出来（坏 JSON / 下架的供应商）就回到默认，不让审核整个挂掉", () => {
    const fallback = { provider: "deepseek", model: deepseek.models[0] };
    expect(parseReviewModel("{坏的")).toEqual(fallback);
    expect(parseReviewModel(JSON.stringify({ provider: "没这家", model: "x" }))).toEqual(fallback);
    expect(parseReviewModel(undefined)).toEqual(fallback);
  });

  it("设了就生效；模型名留空时落到那一家的第一个", async () => {
    const gpt = aiProvider("replicate-gpt")!;
    await setReviewModel(gpt, "");
    expect(await getReviewModel()).toEqual({ provider: "replicate-gpt", model: gpt.models[0] });
  });
});

describe("各家的 token", () => {
  it("Replicate 上的 Claude 和 GPT 共用一个槽位", () => {
    expect(AI_KEY_SLOTS.filter((s) => s === "REPLICATE_API_TOKEN")).toHaveLength(1);
  });

  it("入库的是密文，取出来是原文", async () => {
    await setAiKey(deepseek.envKey, FAKE);
    const stored = table.get(`ai.key.${deepseek.envKey}`)!;
    expect(stored).not.toContain(FAKE);
    expect(await siteAiKey(deepseek)).toBe(FAKE);
  });

  it("后台填的压过环境变量；清掉后台那份就回到环境变量", async () => {
    process.env[deepseek.envKey] = "env-key-0000";
    expect(await siteAiKey(deepseek)).toBe("env-key-0000");
    await setAiKey(deepseek.envKey, FAKE);
    expect(await siteAiKey(deepseek)).toBe(FAKE);
    await setAiKey(deepseek.envKey, "");
    expect(await siteAiKey(deepseek)).toBe("env-key-0000");
  });

  it("回显只有来源和末四位，整串 token 不出现", async () => {
    await setAiKey(deepseek.envKey, FAKE);
    const statuses = await aiKeyStatuses();
    expect(statuses.find((s) => s.slot === deepseek.envKey)).toEqual({
      slot: deepseek.envKey,
      source: "admin",
      last4: "9f3a",
    });
    expect(JSON.stringify(statuses)).not.toContain(FAKE);
    expect(statuses.filter((s) => s.source === "none")).toHaveLength(AI_KEY_SLOTS.length - 1);
  });

  it("不认识的槽位、长得离谱的 token 都拒收", async () => {
    await expect(setAiKey("AUTH_SECRET", "x")).rejects.toThrow();
    await expect(setAiKey(deepseek.envKey, "x".repeat(401))).rejects.toThrow();
  });

  it("选定的那家有 token 才算配置好了", async () => {
    expect(await aiReviewReady()).toBe(false);
    await setAiKey(deepseek.envKey, FAKE);
    expect(await aiReviewReady()).toBe(true);
    // 换到一家没 token 的，又不行了
    await setReviewModel(aiProvider("kimi")!, "");
    expect(await aiReviewReady()).toBe(false);
  });
});
