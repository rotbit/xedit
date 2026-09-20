import { beforeEach, describe, expect, it } from "vitest";

import { AI_PROVIDERS, aiProvider, cleanModel, isAiProviderId } from "@/lib/ai/providers";
import {
  __resetAiConfigForTests,
  aiKeyOf,
  readAiConfig,
  writeAiConfig,
} from "@/features/review/aiConfig";

/**
 * 供应商目录本身要自洽（下拉框和服务端拼地址都靠它），
 * 本机那份设置要守住两件事：换家时模型跟着换（上一家的模型名在这一家不存在），
 * 以及各家的 key 各存各的——换回上一家不该还要再粘一遍。
 */

describe("供应商目录", () => {
  it("id 不重样", () => {
    expect(new Set(AI_PROVIDERS.map((p) => p.id)).size).toBe(AI_PROVIDERS.length);
  });

  it("用户点名要的五家都在：Replicate 上的 Claude、DeepSeek、GPT、Kimi、GLM", () => {
    expect(AI_PROVIDERS.map((p) => p.id).sort()).toEqual([
      "deepseek",
      "glm",
      "kimi",
      "openai",
      "replicate",
    ]);
  });

  it("每家都得有地址、模型和取 key 的去处", () => {
    for (const p of AI_PROVIDERS) {
      expect(p.baseUrl.startsWith("https://"), p.id).toBe(true);
      expect(p.baseUrl.endsWith("/"), p.id).toBe(false); // 拼地址时自己加斜杠
      expect(p.models.length, p.id).toBeGreaterThan(0);
      expect(p.keyUrl.startsWith("https://"), p.id).toBe(true);
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

  it("没存过时给一份能用的默认值", () => {
    const cfg = readAiConfig();
    expect(isAiProviderId(cfg.provider)).toBe(true);
    expect(aiProvider(cfg.provider)!.models).toContain(cfg.model);
    expect(aiKeyOf(cfg)).toBe("");
  });

  it("改完就落盘，下次（清掉内存缓存后）还读得回来", () => {
    writeAiConfig({ provider: "kimi", keys: { kimi: "sk-kimi" } });
    __resetAiConfigForTests();
    const cfg = readAiConfig();
    expect(cfg.provider).toBe("kimi");
    expect(aiKeyOf(cfg)).toBe("sk-kimi");
  });

  it("换供应商时模型跟着换：上一家的模型名在这一家不存在", () => {
    writeAiConfig({ provider: "deepseek", model: "deepseek-reasoner" });
    const next = writeAiConfig({ provider: "glm" });
    expect(next.model).toBe(aiProvider("glm")!.models[0]);
  });

  it("各家的 key 各存各的，换回去不用重粘", () => {
    writeAiConfig({ provider: "deepseek", keys: { deepseek: "sk-ds" } });
    writeAiConfig({ provider: "openai", keys: { openai: "sk-oa" } });
    expect(aiKeyOf(readAiConfig())).toBe("sk-oa");
    expect(aiKeyOf(writeAiConfig({ provider: "deepseek" }))).toBe("sk-ds");
  });

  it("存坏了当没存过，不为这点设置弹错", () => {
    localStorage.setItem("xedit.ai.config", "{不是 JSON");
    __resetAiConfigForTests();
    expect(isAiProviderId(readAiConfig().provider)).toBe(true);
  });

  it("存里混进不认识的供应商也不会带坏（落回默认那家）", () => {
    localStorage.setItem("xedit.ai.config", JSON.stringify({ provider: "胡编的", model: "x" }));
    __resetAiConfigForTests();
    expect(isAiProviderId(readAiConfig().provider)).toBe(true);
  });
});
