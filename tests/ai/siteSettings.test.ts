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
import { MAX_GUIDE_CHARS, defaultReviewGuide, reviewSystemPrompt } from "@/lib/ai/reviewPrompt";
import {
  AI_KEY_SLOTS,
  aiKeyStatuses,
  aiReviewReady,
  getReviewGuide,
  getReviewModel,
  reviewGuideStatuses,
  setReviewGuide,
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

describe("审核提示词", () => {
  it("后台没改过就是代码里的默认文案", async () => {
    expect(await getReviewGuide("expression")).toBe(defaultReviewGuide("expression"));
    const statuses = await reviewGuideStatuses();
    expect(statuses.map((s) => s.kind)).toEqual(["expression", "wechat_rules"]);
    expect(statuses.every((s) => !s.custom && s.text === s.defaultText)).toBe(true);
  });

  it("改了就生效，而且只动这一类", async () => {
    await setReviewGuide("expression", "  你是毒舌主编，只挑最要命的三处。 ");
    expect(await getReviewGuide("expression")).toBe("你是毒舌主编，只挑最要命的三处。");
    expect(await getReviewGuide("wechat_rules")).toBe(defaultReviewGuide("wechat_rules"));
    expect((await reviewGuideStatuses())[0].custom).toBe(true);
  });

  it("传空串、或原样交回默认文案 = 恢复默认，库里不留行", async () => {
    await setReviewGuide("expression", "自己写的");
    await setReviewGuide("expression", "");
    expect(table.has("ai.prompt.expression")).toBe(false);
    await setReviewGuide("expression", defaultReviewGuide("expression"));
    expect(table.has("ai.prompt.expression")).toBe(false);
  });

  it("认不出的审核类型、超长的提示词都拒收", async () => {
    await expect(setReviewGuide("没这类", "x")).rejects.toThrow();
    await expect(setReviewGuide("expression", "字".repeat(MAX_GUIDE_CHARS + 1))).rejects.toThrow();
  });

  it("管理员怎么改，输出格式那段都接在最后：JSON 形状和分类 id 改不坏", () => {
    const prompt = reviewSystemPrompt("expression", "随便写点什么");
    expect(prompt.startsWith("随便写点什么")).toBe(true);
    expect(prompt).toContain('"quote"');
    expect(prompt).toContain("grammar（语病）");
    // 空的当没给，回到默认
    expect(reviewSystemPrompt("expression", "  ")).toBe(reviewSystemPrompt("expression"));
  });
});
