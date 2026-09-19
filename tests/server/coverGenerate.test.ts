import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CoverError,
  __resetCoverModelsForTests,
  buildPrompt,
  coverFields,
  generateCovers,
} from "@/lib/coverGenerate/replicate";

/**
 * 服务端生图：填空清洗、提示词模板、Replicate 调用与轮询、入参自适应（换模型后 422 的那些字段）、
 * 错误码映射、Token 不外泄。全程假 fetch，绝不真的打 Replicate。
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

type Args = {
  title?: unknown;
  highlights?: unknown;
  left?: unknown;
  right?: unknown;
};

/** 大多数用例不关心填了什么，用这份最省事的：一个标题 + 一个产品 */
const ONE = { title: "猫", left: { name: "Claude", color: "blue" } };

const run = (args: Args, fetchImpl: typeof fetch) =>
  generateCovers(args, { fetchImpl, pollMs: 1 });

/** 取出失败：测的全是失败路径，成功反而是 bug */
async function fails(promise: Promise<unknown>): Promise<CoverError> {
  const e = await promise.then(
    () => new Error("本该失败却成功了"),
    (err: unknown) => err
  );
  expect(e).toBeInstanceOf(CoverError);
  return e as CoverError;
}

/** 某次调用第 i 发请求的 input（POST 出去的那份） */
const inputOf = (calls: Call[], i: number) =>
  JSON.parse(calls[i].init.body as string).input as Record<string, unknown>;

beforeEach(() => {
  vi.stubEnv("REPLICATE_API_TOKEN", TOKEN);
  // 入参适配是按模型记在模块级 Map 里的，不清掉会串到下一个用例
  __resetCoverModelsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetCoverModelsForTests();
});

describe("填空清洗", () => {
  it("换行、控制字符、「」全洗掉，空白合并；空的重点词丢掉，最多留两个", () => {
    const fields = coverFields({
      title: " 标\n题\t里带「引号」 和  空白 ",
      highlights: ["  ", "重\n点", "第二个", "第三个"],
      left: { name: " A\u0000名 ", color: "blue" },
      right: { name: "B 名", color: "不存在的颜色" },
    });
    expect(fields.title).toBe("标 题 里带引号 和 空白");
    expect(fields.highlights).toEqual(["重 点", "第二个"]);
    expect(fields.left.name).toBe("A 名");
    // 不认识的色号退回深灰，不因为一个错字整单失败
    expect(fields.right?.color).toBe("gray");
  });

  it("各自的字数上限：标题 100、产品名 40、重点词 30", () => {
    const fields = coverFields({
      title: "标".repeat(200),
      highlights: ["重".repeat(50)],
      left: { name: "A".repeat(80), color: "blue" },
    });
    expect(fields.title).toHaveLength(100);
    expect(fields.highlights[0]).toHaveLength(30);
    expect(fields.left.name).toHaveLength(40);
  });

  it("标题、产品 A 是必填；产品 B 没名字就当没填", () => {
    const bad = (req: Args) => {
      try {
        coverFields(req);
        return new Error("本该失败却成功了");
      } catch (e) {
        return e;
      }
    };
    for (const title of ["", "   ", "\n", null, undefined, "「」"]) {
      const e = bad({ title, left: { name: "A", color: "blue" } });
      expect(e, JSON.stringify(title)).toBeInstanceOf(CoverError);
      expect((e as CoverError).code).toBe("bad_input");
      expect((e as CoverError).message).toMatch(/标题是空的/);
    }
    for (const left of [undefined, {}, { name: "  " }, "字符串"]) {
      const e = bad({ title: "标题", left });
      expect(e, JSON.stringify(left)).toBeInstanceOf(CoverError);
      expect((e as CoverError).message).toMatch(/至少填一个产品/);
    }
    const blankRight = coverFields({ title: "标题", left: { name: "A" }, right: { name: " " } });
    expect(blankRight.right).toBeUndefined();
    // 没传 color 也算数：按不认识处理，退回深灰
    expect(coverFields({ title: "标题", left: { name: "A" } }).left.color).toBe("gray");
  });
});

describe("buildPrompt", () => {
  const two = coverFields({
    title: "两家大模型谁更能写",
    highlights: ["更能写", "更便宜"],
    left: { name: "Claude", color: "orange" },
    right: { name: "GPT", color: "green" },
  });

  it("两个产品：标题、两个重点词、两边的名字与配色、实际比例都在里面", () => {
    const p = buildPrompt(two, "16:9");
    expect(p).toContain("比例 16:9");
    expect(p).toContain("「两家大模型谁更能写」");
    expect(p).toContain("「更能写」");
    expect(p).toContain("「更便宜」");
    expect(p).toContain("Claude 使用暖橙 / 陶土色，GPT 使用绿色，其他文字使用深灰。");
    expect(p).toContain("右侧使用两个圆角卡片 / 产品卡片形成对比关系。");
    expect(p).toContain("每张卡片只保留：");
    expect(p).toContain("两张卡片中间可以放一个简洁的 VS");
    expect(p).toContain("Claude vs GPT");
    // 比例是可选参数，默认还是 21:9
    expect(buildPrompt(two)).toContain("比例 21:9");
  });

  it("只有一个产品：右侧改成单卡片，没有 VS 也不提对比", () => {
    const p = buildPrompt(
      coverFields({ title: "只讲一个", highlights: ["快"], left: { name: "Claude", color: "blue" } })
    );
    expect(p).toContain("放产品 / 模型视觉；");
    expect(p).toContain("右侧使用一张圆角产品卡片作为视觉主体。");
    expect(p).toContain("卡片只保留：");
    expect(p).toContain("Claude 使用蓝色，其他文字使用深灰。");
    expect(p).toContain("重点突出：\n「快」\n右侧展示：\nClaude\n");
    expect(p).not.toContain("对比关系");
    expect(p).not.toContain("VS");
  });

  it("一个重点词都没填：换成让模型自己从标题里挑，不留空的「」", () => {
    const p = buildPrompt(coverFields({ title: "标题", left: { name: "A", color: "red" } }));
    expect(p).toContain("重点突出：从标题里挑 1～2 个最关键的词");
    expect(p).not.toContain("「」");
  });
});

describe("generateCovers", () => {
  it("同步成功（Prefer: wait 直接出结果）→ dataURL；下载图片不带 Token", async () => {
    const { impl, calls } = mockFetch(
      jsonRes(200, { status: "succeeded", output: [IMG] }),
      imgRes()
    );
    const images = await run(ONE, impl);
    expect(images).toHaveLength(1);
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
    }).toEqual({ a: "21:9", n: 1, f: "jpg", q: 90 });
    // 图片在 CDN 上，Token 不该跟过去
    expect(calls[1].url).toBe(IMG);
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(JSON.stringify(calls.slice(1))).not.toContain(TOKEN);
  });

  it("output 是单个字符串也认", async () => {
    const { impl, calls } = mockFetch(
      jsonRes(200, { status: "succeeded", output: IMG }),
      imgRes("image/png")
    );
    const images = await run(ONE, impl);
    expect(images).toHaveLength(1);
    expect(images[0].startsWith("data:image/png;base64,")).toBe(true);
    expect(inputOf(calls, 0).num_outputs).toBe(1);
  });

  it("一次点击只生一张：模型只给一张也不会再补一发", async () => {
    const { impl, calls } = mockFetch(jsonRes(200, { status: "succeeded", output: [IMG] }), imgRes());
    expect(await run(ONE, impl)).toHaveLength(1);
    // 一发创建 + 一次下载就完了：不够就补的那段已经去掉，不满意由用户自己再点一次
    expect(calls).toHaveLength(2);
    expect(calls.filter((c) => c.init.method === "POST")).toHaveLength(1);
  });

  it("模型一口气给了好几张：只要第一张，多的不下载", async () => {
    const other = "https://replicate.delivery/pbxt/def.jpg";
    const { impl, calls } = mockFetch(
      jsonRes(200, { status: "succeeded", output: [IMG, other, other] }),
      imgRes()
    );
    expect(await run(ONE, impl)).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe(IMG);
  });

  it("模型带版本号时走 /v1/predictions + version", async () => {
    vi.stubEnv("REPLICATE_MODEL", "owner/name:abc123");
    const { impl, calls } = mockFetch(jsonRes(200, { status: "succeeded", output: [IMG] }), imgRes());
    await run(ONE, impl);
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
    const images = await run(ONE, impl);
    expect(images).toHaveLength(1);
    expect(calls[1].url).toBe(get);
    expect(calls[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("轮询地址不在 api.replicate.com 上就中止，绝不把 Token 送过去", async () => {
    const { impl, calls } = mockFetch(
      jsonRes(200, { status: "starting", urls: { get: "https://evil.example/p1" } })
    );
    const err = await fails(run(ONE, impl));
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
      const err = await fails(run(ONE, impl));
      expect(err.code, String(status)).toBe(code);
      expect(err.message).not.toContain(TOKEN);
    }
  });

  it("422 带上 Replicate 的 detail，且截断", async () => {
    const { impl } = mockFetch(jsonRes(422, { detail: "X".repeat(500) }));
    const err = await fails(run(ONE, impl));
    expect(err.code).toBe("bad_input");
    expect(err.message).toContain("X".repeat(200));
    expect(err.message).not.toContain("X".repeat(201));
  });

  it("没配 Token / 必填的填空缺了 / 网络不通", async () => {
    vi.stubEnv("REPLICATE_API_TOKEN", "");
    const { impl } = mockFetch(jsonRes(200, {}));
    expect((await fails(run(ONE, impl))).code).toBe("no_token");

    // 路由那边已经挡过一道，这里再挡一道：谁调用都不放过，且一次上游都不碰
    vi.stubEnv("REPLICATE_API_TOKEN", TOKEN);
    const missing: Args[] = [
      { title: "", left: { name: "A", color: "blue" } },
      { title: "   ", left: { name: "A", color: "blue" } },
      { title: "猫" },
      { title: "猫", left: { name: " " } },
    ];
    for (const args of missing) {
      const m = mockFetch(jsonRes(200, {}));
      expect((await fails(run(args, m.impl))).code, JSON.stringify(args)).toBe("bad_input");
      expect(m.calls).toHaveLength(0);
    }

    const boom = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await fails(run(ONE, boom));
    expect(err.code).toBe("network");
    expect(err.message).toMatch(/连不上生图服务/);
  });

  it("prediction failed：带原因；内容安全拦截换成人话", async () => {
    const { impl } = mockFetch(
      jsonRes(200, { status: "failed", error: "CUDA out of memory " + "y".repeat(500) })
    );
    const err = await fails(run(ONE, impl));
    expect(err.code).toBe("failed");
    expect(err.message).toContain("CUDA out of memory");
    expect(err.message.length).toBeLessThan(260);

    for (const why of ["NSFW content detected", "flagged by the safety checker"]) {
      const m = mockFetch(jsonRes(200, { status: "failed", error: why }));
      const e = await fails(run(ONE, m.impl));
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
    const err = await fails(run(ONE, impl));
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
      const err = await fails(run(ONE, impl));
      expect(err.code).toBe("failed");
      expect(err.message).toMatch(re);
    }
    const { impl } = mockFetch(
      jsonRes(200, { status: "succeeded", output: ["http://replicate.delivery/a.jpg"] })
    );
    expect((await fails(run(ONE, impl))).message).toMatch(/https/);
  });

  it("Token 不出现在任何错误文案里，上游回显也擦掉", async () => {
    const { impl } = mockFetch(jsonRes(422, { detail: `Bearer ${TOKEN} is invalid` }));
    const err = await fails(run(ONE, impl));
    expect(err.code).toBe("bad_input");
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).toContain("***");
  });
});

describe("入参自适应：换了模型，入参跟着模型的脾气走", () => {
  /** 线上第一次真实调用时 Replicate 回的那段 detail，原样拿来测 */
  const ASPECT_DETAIL =
    '- input.aspect_ratio: aspect_ratio must be one of the following: "1:1", "3:2", "2:3", ' +
    '"4:3", "3:4", "16:9", "9:16", "auto", "1024x1024", "1536x1024", "1024x1536", ' +
    '"1536x1152", "1152x1536", "2048x2048"';

  it("比例被拒：换成 detail 里最宽的横向比例重试，提示词里的比例跟着改", async () => {
    const { impl, calls } = mockFetch(
      jsonRes(422, { detail: ASPECT_DETAIL }),
      jsonRes(200, { status: "succeeded", output: [IMG] }),
      imgRes()
    );
    const images = await run(ONE, impl);
    expect(images).toHaveLength(1);
    expect(inputOf(calls, 0).aspect_ratio).toBe("21:9");
    // 1536x1024 这类像素写法和 auto 都不算比例；3:2、4:3 都比 16:9 窄
    expect(inputOf(calls, 1).aspect_ratio).toBe("16:9");
    expect(inputOf(calls, 1).prompt).toContain("比例 16:9");
    expect(inputOf(calls, 1).prompt).not.toContain("21:9");
  });

  it("detail 里一个横向比例都没有：不重试，按原样报 bad_input", async () => {
    const detail = 'aspect_ratio must be one of the following: "1:1", "2:3", "9:16", "auto"';
    const { impl, calls } = mockFetch(jsonRes(422, { detail }));
    const err = await fails(run(ONE, impl));
    expect(err.code).toBe("bad_input");
    expect(err.message).toContain("1:1"); // 给用户看的还是上游原话
    expect(calls).toHaveLength(1);
  });

  it("num_outputs 被拒：摘掉它重试，其余字段一个不动", async () => {
    const { impl, calls } = mockFetch(
      jsonRes(422, { detail: "- input.num_outputs: Additional properties are not allowed" }),
      jsonRes(200, { status: "succeeded", output: [IMG] }),
      imgRes()
    );
    const images = await run(ONE, impl);
    expect(images).toHaveLength(1);
    expect(inputOf(calls, 0).num_outputs).toBe(1);
    expect(inputOf(calls, 1)).not.toHaveProperty("num_outputs");
    // 没被点名的字段一个都别动
    expect(inputOf(calls, 1).aspect_ratio).toBe("21:9");
    expect(inputOf(calls, 1).output_format).toBe("jpg");
    expect(calls).toHaveLength(3);
  });

  it("适配结果按模型记住：同一模型第二次调用第一发就用适配好的入参", async () => {
    vi.stubEnv("REPLICATE_MODEL", "acme/picky");
    const first = mockFetch(
      jsonRes(422, { detail: ASPECT_DETAIL }),
      jsonRes(200, { status: "succeeded", output: [IMG] }),
      imgRes()
    );
    await run(ONE, first.impl);

    const again = mockFetch(jsonRes(200, { status: "succeeded", output: [IMG] }), imgRes());
    await run({ ...ONE, title: "狗" }, again.impl);
    expect(inputOf(again.calls, 0).aspect_ratio).toBe("16:9");
    expect(again.calls).toHaveLength(2); // 没再白撞一次 422
  });

  it("重试有上限：上游一直挑刺也最多改 3 次就放弃", async () => {
    const detail = 'aspect_ratio must be one of the following: "16:9", "3:2", "4:3", "5:4", "1:1"';
    const rejected = jsonRes(422, { detail });
    const { impl, calls } = mockFetch(rejected, rejected, rejected, rejected, rejected);
    const err = await fails(run(ONE, impl));
    expect(err.code).toBe("bad_input");
    expect(calls.map((_, i) => inputOf(calls, i).aspect_ratio)).toEqual([
      "21:9",
      "16:9",
      "3:2",
      "4:3",
    ]);
  });

  it("REPLICATE_ASPECT_RATIO 覆盖默认比例；它自己被拒也照样自适应", async () => {
    vi.stubEnv("REPLICATE_ASPECT_RATIO", "3:2");
    const a = mockFetch(jsonRes(200, { status: "succeeded", output: [IMG] }), imgRes());
    await run(ONE, a.impl);
    expect(inputOf(a.calls, 0).aspect_ratio).toBe("3:2");
    expect(inputOf(a.calls, 0).prompt).toContain("比例 3:2");

    vi.stubEnv("REPLICATE_ASPECT_RATIO", "32:9");
    const b = mockFetch(
      jsonRes(422, { detail: ASPECT_DETAIL }),
      jsonRes(200, { status: "succeeded", output: [IMG] }),
      imgRes()
    );
    await run(ONE, b.impl);
    expect(inputOf(b.calls, 0).aspect_ratio).toBe("32:9");
    expect(inputOf(b.calls, 1).aspect_ratio).toBe("16:9");
  });
});
