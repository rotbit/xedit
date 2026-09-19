import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/cover/generate 的门禁与限流：未登录、非管理员、没配 Token、请求体、并发与每日额度。
 * 只把会话换成桩——管理员判定走真的 lib/admin（按 ADMIN_EMAILS 现算），
 * 生图也走真的 lib/coverGenerate/replicate，只是全局 fetch 是假的，绝不真的打 Replicate。
 */
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { POST } from "@/app/api/cover/generate/route";

const authMock = auth as unknown as Mock;

const TOKEN = "r8_TESTTOKEN_SHOULD_NOT_LEAK";
const ADMIN = "boss@example.com";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const IMG = "https://replicate.delivery/pbxt/abc.jpg";
const DATA_URL = `data:image/jpeg;base64,${JPEG.toString("base64")}`;

type FetchLike = (url: string, init: RequestInit) => Promise<unknown>;

/** 一个刚好够用的上游：打 Replicate 就直接出图，打别处就是下载那张图。gate 用来把第一次生成卡住 */
function okFetch(gate?: Promise<void>) {
  let first = true;
  return vi.fn<FetchLike>(async (url) => {
    if (url.startsWith("https://api.replicate.com/")) {
      if (first) {
        first = false;
        if (gate) await gate;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ status: "succeeded", output: [IMG] }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "image/jpeg" : "6") },
      json: async () => {
        throw new Error("not json");
      },
      arrayBuffer: async () => JPEG,
    };
  });
}

/** 一份填得齐的请求体：门禁和限流的用例不关心填了什么 */
const ONE = { title: "两家大模型谁更能写", left: { name: "Claude", color: "orange" } };

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/cover/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

const signedInAs = (id: string, email: string) => authMock.mockResolvedValue({ user: { id, email } });

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  vi.stubEnv("REPLICATE_API_TOKEN", TOKEN);
  // 失败路径会往 stderr 写一行，测试输出里不需要
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/cover/generate 的门禁", () => {
  it("没登录 → 401，上游一次没碰", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    authMock.mockResolvedValue(null);

    const res = await post(ONE);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized", message: "请先登录再使用 AI 生成封面" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("登录了但不在 ADMIN_EMAILS 里 → 403，上游一次没碰", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    signedInAs("u-normal", "someone@example.com");

    const res = await post(ONE);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "forbidden",
      message: "AI 生成封面目前只对管理员开放",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("名单大小写、空格都不计较；改名单立刻生效", async () => {
    vi.stubEnv("ADMIN_EMAILS", ` other@example.com , ${ADMIN.toUpperCase()} `);
    vi.stubGlobal("fetch", okFetch());
    signedInAs("u-admin", ADMIN);
    expect((await post(ONE)).status).toBe(200);
  });

  it("管理员但站点没配 Token → 503", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("REPLICATE_API_TOKEN", "");
    signedInAs("u-admin", ADMIN);

    const res = await post(ONE);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("no_token");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/cover/generate 的请求体", () => {
  beforeEach(() => signedInAs("u-admin", ADMIN));

  it("超过 16KB → 413（自报的和实际的都算）", async () => {
    vi.stubGlobal("fetch", okFetch());
    expect((await post({ title: "x".repeat(40 * 1024) })).status).toBe(413);
    expect((await post(ONE, { "content-length": String(64 * 1024) })).status).toBe(413);
  });

  it("标题或产品 A 为空、或根本不是 JSON → 400，上游一次没碰", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    signedInAs("u-bad-input", ADMIN);

    const empty = await post({ title: "   ", left: { name: "Claude", color: "blue" } });
    expect(empty.status).toBe(400);
    expect((await empty.json()).message).toMatch(/标题是空的/);

    const noLeft = await post({ title: "标题", left: { name: " " } });
    expect(noLeft.status).toBe(400);
    expect((await noLeft.json()).message).toMatch(/至少填一个产品/);

    expect((await post({})).status).toBe(400);
    const broken = await post("{ 不是 JSON");
    expect(broken.status).toBe(400);
    expect((await broken.json()).error).toBe("bad_input");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("填错的请求不占额度：挡在限流之前", async () => {
    vi.stubEnv("COVER_GENERATE_DAILY_LIMIT", "1");
    vi.stubGlobal("fetch", okFetch());
    signedInAs("u-no-slot", ADMIN);

    expect((await post({ title: "", left: { name: "Claude", color: "blue" } })).status).toBe(400);
    // 今天只有一次额度，刚才那次要是算进去了，这一次就该 429 了
    expect((await post(ONE)).status).toBe(200);
  });

  it("成功 → 200 带一张图；只创建一发 prediction，填空进了提示词", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const res = await post({
      title: "两家大模型谁更能写",
      highlights: ["更能写", "更便宜", "多余的第三个"],
      left: { name: "Claude", color: "orange" },
      right: { name: "GPT", color: "green" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ images: [DATA_URL] });

    // 一次点击只烧一次额度：打给 Replicate 的就这一发
    const created = fetchMock.mock.calls.filter(([url]) =>
      url.startsWith("https://api.replicate.com/")
    );
    expect(created).toHaveLength(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      input: { num_outputs: number; prompt: string };
    };
    expect(sent.input.num_outputs).toBe(1);
    expect(sent.input.prompt).toContain("「两家大模型谁更能写」");
    expect(sent.input.prompt).toContain("Claude 使用暖橙 / 陶土色，GPT 使用绿色");
    expect(sent.input.prompt).toContain("「更便宜」");
    expect(sent.input.prompt).not.toContain("多余的第三个");
  });

  it("上游出错 → 502，且错误文案里没有 Token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchLike>(async () => ({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: async () => ({ detail: `Bearer ${TOKEN} is invalid` }),
      }))
    );
    const res = await post(ONE);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("bad_token");
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });
});

describe("POST /api/cover/generate 的限流", () => {
  it("同一个账号同时只能生一张，第二个回 409", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal("fetch", okFetch(gate));
    signedInAs("u-busy", ADMIN);

    const first = post(ONE);
    // 让第一单先卡在上游那一步
    await Promise.resolve();
    const second = await post({ ...ONE, title: "狗" });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("busy");

    release();
    expect((await first).status).toBe(200);
    // 跑完之后又能生成了
    expect((await post(ONE)).status).toBe(200);
  });

  it("每天的次数用完 → 429，说的是今天用完了", async () => {
    vi.stubEnv("COVER_GENERATE_DAILY_LIMIT", "1");
    vi.stubGlobal("fetch", okFetch());
    signedInAs("u-quota", ADMIN);

    expect((await post(ONE)).status).toBe(200);
    const res = await post(ONE);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(body.message).toContain("今天");
  });
});
