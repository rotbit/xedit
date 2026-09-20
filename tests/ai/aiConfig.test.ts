import { beforeEach, describe, expect, it } from "vitest";

import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  aiProvider,
  cleanModel,
  isAiProviderId,
} from "@/lib/ai/providers";
import { DEFAULT_REVIEW_KIND } from "@/lib/ai/reviewKinds";
import {
  __resetAiConfigForTests,
  readAiConfig,
  writeAiConfig,
} from "@/features/review/aiConfig";

/**
 * 供应商目录本身要自洽（下拉框和服务端拼地址都靠它），
 * 本机那份设置现在只记「审哪一类」：模型和 key 都归后台管，
 * 旧版本留在浏览器里的模型选择和 key 读到就得擦掉。
 */

describe("供应商目录", () => {
  it("id 不重样", () => {
    expect(new Set(AI_PROVIDERS.map((p) => p.id)).size).toBe(AI_PROVIDERS.length);
  });

  it("用户点名要的都在：DeepSeek、Replicate 上的 Claude 和 GPT、OpenAI 官网、Kimi、GLM", () => {
    expect(AI_PROVIDERS.map((p) => p.id).sort()).toEqual([
      "deepseek",
      "glm",
      "kimi",
      "openai",
      "replicate",
      "replicate-gpt",
    ]);
  });

  it("默认那家是 DeepSeek，排在下拉框第一个", () => {
    expect(DEFAULT_AI_PROVIDER).toBe("deepseek");
    expect(AI_PROVIDERS[0].id).toBe("deepseek");
  });

  it("Replicate 上的 GPT 与 Claude 共用一把 token，但输出上限的字段名不一样", () => {
    const gpt = aiProvider("replicate-gpt")!;
    expect(gpt.transport).toBe("replicate");
    expect(gpt.envKey).toBe(aiProvider("replicate")!.envKey);
    expect(gpt.tokensField).toBe("max_completion_tokens");
    for (const m of gpt.models) expect(m.startsWith("openai/gpt")).toBe(true);
  });

  it("每家都得有地址、模型和环境变量名", () => {
    for (const p of AI_PROVIDERS) {
      expect(p.baseUrl.startsWith("https://"), p.id).toBe(true);
      expect(p.baseUrl.endsWith("/"), p.id).toBe(false); // 拼地址时自己加斜杠
      expect(p.models.length, p.id).toBeGreaterThan(0);
      expect(p.envKey, p.id).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it("Replicate 那家列的全是 Claude，且走 replicate 传输", () => {
    const p = aiProvider("replicate")!;
    expect(p.transport).toBe("replicate");
    for (const m of p.models) expect(m.startsWith("anthropic/claude")).toBe(true);
  });

  it("国内外那几家都是 OpenAI 兼容口，才能共用一条传输", () => {
    for (const id of ["deepseek", "openai", "kimi", "glm"] as const) {
      expect(aiProvider(id)!.transport, id).toBe("openai");
    }
  });

  it("认不出的 id 一律 null / false", () => {
    expect(aiProvider("胡编的")).toBeNull();
    expect(isAiProviderId("胡编的")).toBe(false);
  });
});

describe("cleanModel", () => {
  const p = aiProvider("replicate")!;

  it("正常模型名原样留着（带斜杠、冒号、点号的都算正常）", () => {
    expect(cleanModel("anthropic/claude-4.5-sonnet:abc123", p)).toBe(
      "anthropic/claude-4.5-sonnet:abc123"
    );
  });

  it("空的落到这家的默认模型", () => {
    expect(cleanModel("   ", p)).toBe(p.models[0]);
  });

  it("模型名会被拼进 URL，所以奇怪字符要洗掉", () => {
    expect(cleanModel("anthropic/claude?x=1 或者别的", p)).toBe("anthropic/claudex1");
  });
});

describe("本机的 AI 设置", () => {
  beforeEach(() => {
    __resetAiConfigForTests();
    localStorage.clear();
  });

  it("旧版本存在浏览器里的 key 和模型选择读到就擦掉：这些只许待在服务端", () => {
    localStorage.setItem(
      "xedit.ai.config",
      JSON.stringify({ provider: "kimi", model: "x", kind: "wechat_rules", keys: { kimi: "sk-旧的" } })
    );
    __resetAiConfigForTests();
    // 单选时代存的 kind 也认，升级后选择不被重置
    expect(readAiConfig()).toEqual({ kinds: ["wechat_rules"] });
    expect(localStorage.getItem("xedit.ai.config")).toBe(
      JSON.stringify({ kinds: ["wechat_rules"] })
    );
  });

  it("存坏了当没存过，不为这点设置弹错", () => {
    localStorage.setItem("xedit.ai.config", "{不是 JSON");
    __resetAiConfigForTests();
    expect(readAiConfig().kinds).toEqual([DEFAULT_REVIEW_KIND]);
  });

  it("没选过审核类型就给默认那一类", () => {
    expect(readAiConfig().kinds).toEqual([DEFAULT_REVIEW_KIND]);
  });

  it("选过的类型也落盘：下次点「审核」仍停在上回那一类", () => {
    writeAiConfig({ kinds: ["wechat_rules"] });
    __resetAiConfigForTests();
    expect(readAiConfig().kinds).toEqual(["wechat_rules"]);
  });

  it("可以多选；顺序按目录排、重复的去掉，一类都不剩时落回默认（永远不会是空的）", () => {
    expect(writeAiConfig({ kinds: ["wechat_rules", "expression", "wechat_rules"] }).kinds).toEqual([
      "expression",
      "wechat_rules",
    ]);
    expect(writeAiConfig({ kinds: [] }).kinds).toEqual([DEFAULT_REVIEW_KIND]);
  });

  it("旧版本存的那份没有 kind，读出来也得是个能用的类型", () => {
    localStorage.setItem("xedit.ai.config", JSON.stringify({ provider: "deepseek" }));
    __resetAiConfigForTests();
    expect(readAiConfig().kinds).toEqual([DEFAULT_REVIEW_KIND]);
  });

  it("存里的类型被人改花了就落回默认，不把它原样发给接口（发过去只会换来 400）", () => {
    localStorage.setItem("xedit.ai.config", JSON.stringify({ kind: "胡编的" }));
    __resetAiConfigForTests();
    expect(readAiConfig().kinds).toEqual([DEFAULT_REVIEW_KIND]);
    expect(writeAiConfig({ kinds: ["也是胡编的" as never] }).kinds).toEqual([DEFAULT_REVIEW_KIND]);
  });
});
