import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverError, buildPrompt, generateCovers } from "@/lib/coverGenerate/replicate";

/**
 * 服务端生图：提示词模板、Replicate 调用与轮询、错误码映射、Token 不外泄。
 * 全程假 fetch，绝不真的打 Replicate。
 */

/** 一个显眼的假 Token：任何返回、任何错误文案里出现它都算泄漏 */
const TOKEN = "r8_TESTTOKEN_SHOULD_NOT_LEAK";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const IMG = "https://replicate.delivery/pbxt/abc.jpg";

const jsonRes = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});

const imgRes = (type = "image/jpeg", buf = JPEG) => ({
  ok: true,
  status: 200,
  headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? type : String(buf.length)) },
  json: async () => {
    throw new Error("not json");
  },
  arrayBuffer: async () => buf,
});

interface Call {
  url: string;
  init: RequestInit;
  headers: Record<string, string | undefined>;
}

/** 按顺序回放若干个响应，同时把每次请求记下来 */
function mockFetch(...responses: unknown[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init, headers: (init.headers ?? {}) as Record<string, string> });
    const next = responses[calls.length - 1];
    if (!next) throw new Error(`没准备第 ${calls.length} 个响应：${url}`);
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

type Args = { prompt?: unknown; style?: string | null; count?: number };

const run = (args: Args, fetchImpl: typeof fetch) =>
  generateCovers(args as { prompt: string }, { fetchImpl, pollMs: 1 });

/** 取出失败：测的全是失败路径，成功反而是 bug */
async function fails(promise: Promise<unknown>): Promise<CoverError> {
  const e = await promise.then(
    () => new Error("本该失败却成功了"),
    (err: unknown) => err
  );
  expect(e).toBeInstanceOf(CoverError);
  return e as CoverError;
}

beforeEach(() => {
  vi.stubEnv("REPLICATE_API_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildPrompt", () => {
  it("由模板拼：含用户描述、风格后缀、固定约束", () => {
    const p = buildPrompt("一只在屋顶看星星的猫", "minimal");
    expect(p).toContain("一只在屋顶看星星的猫");
    expect(p).toContain("minimalist");
    expect(p).toContain("no text");
    expect(p).toContain("21:9");
    // 未知/缺省风格不加后缀，但约束照旧
    const plain = buildPrompt("猫", "nope");
    expect(plain).not.toContain("minimalist");
    expect(plain).toContain("no text");
    for (const style of ["illustration", "photo", "tech"]) {
      expect(buildPrompt("猫", style)).not.toBe(plain);
    }
  });

  it("超长描述被截断到 600 字", async () => {
    const { impl, calls } = mockFetch(jsonRes(200, { status: "succeeded", output: [IMG] }), imgRes());
    await run({ prompt: "A".repeat(700) + "ZZZTAIL", style: "tech" }, impl);
    const sent = JSON.parse(calls[0].init.body as string).input.prompt as string;
    expect(sent).toContain("A".repeat(600));
    expect(sent).not.toContain("ZZZTAIL");
    expect(sent).not.toContain("A".repeat(601));
    expect(sent).toContain("futuristic");
  });
});

describe("generateCovers", () => {
  it("同步成功（Prefer: wait 直接出结果）→ dataURL；下载图片不带 Token", async () => {
    const { impl, calls } = mockFetch(
      jsonRes(200, { status: "succeeded", output: [IMG, IMG] }),
      imgRes(),
      imgRes()
    );
    const images = await run({ prompt: "猫", count: 2 }, impl);
    expect(images).toHaveLength(2);
    expect(images[0]).toBe(`data:image/jpeg;base64,${JPEG.toString("base64")}`);

    expect(calls[0].url).toBe(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions"
    );
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].headers.Prefer).toBe("wait=60");
    const input = JSON.parse(calls[0].init.body as string).input;
    expect({
      a: input.aspect_ratio,
      n: input.num_outputs,
      f: input.output_format,
      q: input.output_quality,
    }).toEqual({ a: "21:9", n: 2, f: "jpg", q: 90 });
    // 图片在 CDN 上，Token 不该跟过去
    expect(calls[1].url).toBe(IMG);
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(JSON.stringify(calls.slice(1))).not.toContain(TOKEN);
  });

  it("output 是单个字符串也认；count 夹在 1..2", async () => {
    const a = mockFetch(jsonRes(200, { status: "succeeded", output: IMG }), imgRes("image/png"));
    const images = await run({ prompt: "猫", count: 9 }, a.impl);
    expect(images).toHaveLength(1);
    expect(images[0].startsWith("data:image/png;base64,")).toBe(true);
    expect(JSON.parse(a.calls[0].init.body as string).input.num_outputs).toBe(2);

    const b = mockFetch(jsonRes(200, { status: "succeeded", output: [IMG] }), imgRes());
    await run({ prompt: "猫", count: 0 }, b.impl);
    expect(JSON.parse(b.calls[0].init.body as string).input.num_outputs).toBe(1);
  });

  it("模型带版本号时走 /v1/predictions + version", async () => {
    vi.stubEnv("REPLICATE_MODEL", "owner/name:abc123");
    const { impl, calls } = mockFetch(jsonRes(200, { status: "succeeded", output: [IMG] }), imgRes());
    await run({ prompt: "猫" }, impl);
    expect(calls[0].url).toBe("https://api.replicate.com/v1/predictions");
    expect(JSON.parse(calls[0].init.body as string).version).toBe("abc123");
  });

  it("没出结果就轮询 urls.get，直到 succeeded", async () => {
    const get = "https://api.replicate.com/v1/predictions/p1";
    const { impl, calls } = mockFetch(
      jsonRes(200, { status: "starting", urls: { get } }),
      jsonRes(200, { status: "processing", urls: { get } }),
      jsonRes(200, { status: "succeeded", output: [IMG] }),
      imgRes()
    );
    const images = await run({ prompt: "猫" }, impl);
    expect(images).toHaveLength(1);
    expect(calls[1].url).toBe(get);
    expect(calls[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("轮询地址不在 api.replicate.com 上就中止，绝不把 Token 送过去", async () => {
    const { impl, calls } = mockFetch(
      jsonRes(200, { status: "starting", urls: { get: "https://evil.example/p1" } })
    );
    const err = await fails(run({ prompt: "猫" }, impl));
    expect(err.code).toBe("failed");
    expect(calls).toHaveLength(1); // 只发了第一次请求，没去 evil.example
  });

  it("错误码映射", async () => {
    const cases = [
      [401, "bad_token"],
      [403, "bad_token"],
      [402, "billing"],
      [429, "rate_limited"],
      [500, "failed"],
    ] as const;
    for (const [status, code] of cases) {
      const { impl } = mockFetch(jsonRes(status, { detail: "nope" }));
      const err = await fails(run({ prompt: "猫" }, impl));
      expect(err.code, String(status)).toBe(code);
      expect(err.message).not.toContain(TOKEN);
    }
  });

  it("422 带上 Replicate 的 detail，且截断", async () => {
    const { impl } = mockFetch(jsonRes(422, { detail: "X".repeat(500) }));
    const err = await fails(run({ prompt: "猫" }, impl));
    expect(err.code).toBe("bad_input");
    expect(err.message).toContain("X".repeat(200));
    expect(err.message).not.toContain("X".repeat(201));
  });

  it("没配 Token / 描述为空 / 网络不通", async () => {
    vi.stubEnv("REPLICATE_API_TOKEN", "");
    const { impl } = mockFetch(jsonRes(200, {}));
    expect((await fails(run({ prompt: "猫" }, impl))).code).toBe("no_token");

    vi.stubEnv("REPLICATE_API_TOKEN", TOKEN);
    for (const prompt of ["", "   ", null, undefined]) {
      const m = mockFetch(jsonRes(200, {}));
      expect((await fails(run({ prompt }, m.impl))).code, JSON.stringify(prompt)).toBe("bad_input");
    }

    const boom = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await fails(run({ prompt: "猫" }, boom));
    expect(err.code).toBe("network");
    expect(err.message).toMatch(/连不上生图服务/);
  });

  it("prediction failed：带原因；内容安全拦截换成人话", async () => {
    const { impl } = mockFetch(
      jsonRes(200, { status: "failed", error: "CUDA out of memory " + "y".repeat(500) })
    );
    const err = await fails(run({ prompt: "猫" }, impl));
    expect(err.code).toBe("failed");
    expect(err.message).toContain("CUDA out of memory");
    expect(err.message.length).toBeLessThan(260);

    for (const why of ["NSFW content detected", "flagged by the safety checker"]) {
      const m = mockFetch(jsonRes(200, { status: "failed", error: why }));
      const e = await fails(run({ prompt: "猫" }, m.impl));
      expect(e.code).toBe("failed");
      expect(e.message).toMatch(/内容安全策略/);
    }
  });

  it("超时：停下并尽力取消", async () => {
    vi.stubEnv("COVER_GENERATE_TIMEOUT_SEC", "0.01");
    // 一直回 processing，怎么轮询都等不到结果，只能被超时截停
    const urls = {
      get: "https://api.replicate.com/v1/predictions/p1",
      cancel: "https://api.replicate.com/v1/predictions/p1/cancel",
    };
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return jsonRes(200, url === urls.cancel ? { status: "canceled" } : { status: "processing", urls });
    }) as unknown as typeof fetch;
    const err = await fails(run({ prompt: "猫" }, impl));
    expect(err.code).toBe("timeout");
    expect(calls.some((c) => c.url === urls.cancel && c.init.method === "POST")).toBe(true);
  });

  it("下载校验：只收 https 与 image/*，超过 8MB 不要", async () => {
    const bad: [unknown, RegExp][] = [
      [imgRes("text/html"), /不是图片/],
      [{ ok: false, status: 404, headers: { get: () => null }, json: async () => null }, /图片下载失败/],
      [imgRes("image/jpeg", Buffer.alloc(9 * 1024 * 1024)), /太大/],
    ];
    for (const [res, re] of bad) {
      const { impl } = mockFetch(jsonRes(200, { status: "succeeded", output: [IMG] }), res);
      const err = await fails(run({ prompt: "猫" }, impl));
      expect(err.code).toBe("failed");
      expect(err.message).toMatch(re);
    }
    const { impl } = mockFetch(
      jsonRes(200, { status: "succeeded", output: ["http://replicate.delivery/a.jpg"] })
    );
    expect((await fails(run({ prompt: "猫" }, impl))).message).toMatch(/https/);
  });

  it("Token 不出现在任何错误文案里，上游回显也擦掉", async () => {
    const { impl } = mockFetch(jsonRes(422, { detail: `Bearer ${TOKEN} is invalid` }));
    const err = await fails(run({ prompt: "猫" }, impl));
    expect(err.code).toBe("bad_input");
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).toContain("***");
  });
});
