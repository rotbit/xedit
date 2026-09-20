import { describe, expect, it, vi } from "vitest";

import { AiError, chatComplete } from "@/lib/ai/chat";
import { aiProvider } from "@/lib/ai/providers";

/**
 * 传输层：拼对请求、认对回复、把各家的报错翻成同一套说法。
 * 这里全程注入假 fetch——真去调 DeepSeek 既慢又要钱，而要验的东西
 * （发到哪个地址、带没带 Authorization、429 变成哪个错误码）都在报文里。
 *
 * 另有一条铁律在这儿钉着：key 不许出现在任何往外抛的错误文案里。
 */

const deepseek = aiProvider("deepseek")!;
const replicate = aiProvider("replicate")!;
const KEY = "sk-secret-key-0001";

/** 记下每次调用的假 fetch；按顺序返回预备好的响应 */
function fakeFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error("假 fetch 被多调了一次");
    return next;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const chatOk = (content: string) => json({ choices: [{ message: { content } }] });

const ask = (over: Record<string, unknown> = {}) => ({
  provider: deepseek,
  model: "deepseek-chat",
  apiKey: KEY,
  system: "你是编辑",
  user: "审一下",
  ...over,
});

describe("chatComplete：OpenAI 兼容的那几家", () => {
  it("发到 /chat/completions，带 Bearer，回复原样取出", async () => {
    const { impl, calls } = fakeFetch(chatOk("模型说的话"));
    const out = await chatComplete(ask(), { fetchImpl: impl });
    expect(out).toBe("模型说的话");
    expect(calls[0].url).toBe("https://api.deepseek.com/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("deepseek-chat");
    expect(body.messages).toEqual([
      { role: "system", content: "你是编辑" },
      { role: "user", content: "审一下" },
    ]);
    expect(body.stream).toBe(false);
  });

  it("认 JSON 模式的家才发 response_format", async () => {
    const { impl, calls } = fakeFetch(chatOk("{}"));
    await chatComplete(ask({ json: true }), { fetchImpl: impl });
    expect(JSON.parse(String(calls[0].init.body)).response_format).toEqual({ type: "json_object" });
  });

  it("温度压得很低：审核要的是稳定复现", async () => {
    const { impl, calls } = fakeFetch(chatOk("x"));
    await chatComplete(ask(), { fetchImpl: impl });
    expect(JSON.parse(String(calls[0].init.body)).temperature).toBeLessThanOrEqual(0.3);
  });

  it("分段数组形式的回复也能拼起来", async () => {
    const { impl } = fakeFetch(json({ choices: [{ message: { content: [{ text: "前" }, "后"] } }] }));
    expect(await chatComplete(ask(), { fetchImpl: impl })).toBe("前后");
  });

  it("空回复算失败：上层拿空串没法解析", async () => {
    const { impl } = fakeFetch(chatOk("   "));
    await expect(chatComplete(ask(), { fetchImpl: impl })).rejects.toMatchObject({ code: "failed" });
  });
});

describe("chatComplete：报错的翻译", () => {
  const cases: [number, string][] = [
    [401, "bad_key"],
    [403, "bad_key"],
    [402, "billing"],
    [404, "bad_input"],
    [429, "rate_limited"],
    [400, "bad_input"],
    [500, "failed"],
  ];

  for (const [status, code] of cases) {
    it(`HTTP ${status} → ${code}`, async () => {
      const { impl } = fakeFetch(json({ error: { message: "上游说的原话" } }, status));
      await expect(chatComplete(ask(), { fetchImpl: impl })).rejects.toMatchObject({ code });
    });
  }

  it("没填 key 直接报 no_key，不白发一次请求", async () => {
    const { impl, calls } = fakeFetch(chatOk("x"));
    await expect(chatComplete(ask({ apiKey: "  " }), { fetchImpl: impl })).rejects.toMatchObject({
      code: "no_key",
    });
    expect(calls).toHaveLength(0);
  });

  it("连不上按 network，不按「模型出错」", async () => {
    const impl = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    await expect(chatComplete(ask(), { fetchImpl: impl })).rejects.toMatchObject({
      code: "network",
    });
  });

  it("上游把 key 回显在报错里也不会漏出去", async () => {
    const { impl } = fakeFetch(json({ error: { message: `key ${KEY} 无效` } }, 400));
    const err = await chatComplete(ask(), { fetchImpl: impl }).catch((e: AiError) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).message).not.toContain(KEY);
    expect((err as AiError).message).toContain("***");
  });
});

describe("chatComplete：Replicate 上的 Claude", () => {
  const claude = () => ask({ provider: replicate, model: "anthropic/claude-4.5-sonnet" });

  it("发到「模型最新版」那个接口，入参是 prompt + system_prompt", async () => {
    const { impl, calls } = fakeFetch(json({ status: "succeeded", output: ["一段", "话"] }));
    expect(await chatComplete(claude(), { fetchImpl: impl })).toBe("一段话");
    expect(calls[0].url).toBe(
      "https://api.replicate.com/v1/models/anthropic/claude-4.5-sonnet/predictions"
    );
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input.prompt).toBe("审一下");
    expect(body.input.system_prompt).toBe("你是编辑");
    expect(body.version).toBeUndefined();
  });

  it("模型名带版本号时改走 /v1/predictions", async () => {
    const { impl, calls } = fakeFetch(json({ status: "succeeded", output: "好" }));
    await chatComplete(ask({ provider: replicate, model: "anthropic/claude-4.5-sonnet:abc123" }), {
      fetchImpl: impl,
    });
    expect(calls[0].url).toBe("https://api.replicate.com/v1/predictions");
    expect(JSON.parse(String(calls[0].init.body)).version).toBe("abc123");
  });

  it("没当场出结果就接着轮询，直到 succeeded", async () => {
    const { impl, calls } = fakeFetch(
      json({ status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/x" } }),
      json({ status: "succeeded", output: ["好了"] })
    );
    expect(await chatComplete(claude(), { fetchImpl: impl, pollMs: 0 })).toBe("好了");
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe("https://api.replicate.com/v1/predictions/x");
  });

  it("上游给了个别处的轮询地址就中止，绝不把 key 带去别人家", async () => {
    const { impl } = fakeFetch(
      json({ status: "processing", urls: { get: "https://evil.example.com/steal" } })
    );
    await expect(chatComplete(claude(), { fetchImpl: impl, pollMs: 0 })).rejects.toMatchObject({
      code: "failed",
    });
  });

  it("失败的 prediction 变成 failed，附上上游给的原因", async () => {
    const { impl } = fakeFetch(json({ status: "failed", error: "模型崩了" }));
    const err = await chatComplete(claude(), { fetchImpl: impl }).catch((e: AiError) => e);
    expect((err as AiError).code).toBe("failed");
    expect((err as AiError).message).toContain("模型崩了");
  });

  it("Replicate 这条路不发 response_format（它不认）", async () => {
    const { impl, calls } = fakeFetch(json({ status: "succeeded", output: "好" }));
    await chatComplete({ ...claude(), json: true }, { fetchImpl: impl });
    expect(String(calls[0].init.body)).not.toContain("response_format");
  });
});
