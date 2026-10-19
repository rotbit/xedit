import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gating and rate limiting for /api/cover/generate: not signed in, not enabled, no token configured, request body, concurrency and daily quota.
 * Session and database are stubbed (the database holds just an in-memory user table) — permission checks use the real lib/permissions + lib/admin
 * (admins computed from ADMIN_EMAILS), and generation uses the real lib/coverGenerate/replicate;
 * only the global fetch is fake, never actually hitting Replicate.
 */
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/cover/generate/route";

const authMock = auth as unknown as Mock;
const findUserMock = prisma.user.findUnique as unknown as Mock;

interface UserRow {
  email: string | null;
  bannedAt: Date | null;
  permissions: string[];
  aiReviewDailyLimit: number | null;
  aiCoverDailyLimit: number | null;
}
/** In-memory user table: looked up by id; an unregistered id means the user isn't in the database */
let users: Map<string, UserRow>;

const TOKEN = "r8_TESTTOKEN_SHOULD_NOT_LEAK";
const ADMIN = "boss@example.com";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const IMG = "https://replicate.delivery/pbxt/abc.jpg";
const DATA_URL = `data:image/jpeg;base64,${JPEG.toString("base64")}`;

type FetchLike = (url: string, init: RequestInit) => Promise<unknown>;

/** A just-enough upstream: requests to Replicate return an image directly, anything else is the image download. gate holds the first generation */
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

/** A fully filled request body: gating and rate-limit cases don't care what's in it */
const ONE = { title: "两家大模型谁更能写", left: { name: "Claude", color: "orange" } };

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/cover/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

/** Sign in as an account and register it in the in-memory user table (no permissions enabled by default) */
const signedInAs = (id: string, email: string, extra: Partial<UserRow> = {}) => {
  users.set(id, {
    email,
    bannedAt: null,
    permissions: [],
    aiReviewDailyLimit: null,
    aiCoverDailyLimit: null,
    ...extra,
  });
  authMock.mockResolvedValue({ user: { id, email } });
};

beforeEach(() => {
  users = new Map();
  findUserMock.mockImplementation(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null);
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  vi.stubEnv("REPLICATE_API_TOKEN", TOKEN);
  // Failure paths write a line to stderr; not needed in test output
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

  it("登录了但没开通 ai_cover → 403，上游一次没碰", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    signedInAs("u-normal", "someone@example.com");

    const res = await post(ONE);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "forbidden",
      message: "你的账号还没开通 AI 生成封面，找管理员开通",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("只开了 ai_review 的也不行：权限按项算", async () => {
    vi.stubGlobal("fetch", okFetch());
    signedInAs("u-review-only", "someone@example.com", { permissions: ["ai_review"] });
    expect((await post(ONE)).status).toBe(403);
  });

  it("开通了 ai_cover 的普通账号 → 200", async () => {
    vi.stubGlobal("fetch", okFetch());
    signedInAs("u-granted", "someone@example.com", { permissions: ["ai_cover"] });
    const res = await post(ONE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ images: [DATA_URL] });
  });

  it("开通了但被封禁 → 403", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    signedInAs("u-banned", "someone@example.com", { permissions: ["ai_cover"], bannedAt: new Date() });
    expect((await post(ONE)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("会话还在但库里已没这个人 → 403", async () => {
    vi.stubGlobal("fetch", okFetch());
    authMock.mockResolvedValue({ user: { id: "u-gone", email: ADMIN } });
    expect((await post(ONE)).status).toBe(403);
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

  it("标题为空、或根本不是 JSON → 400，上游一次没碰（产品 A 不填不算错）", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    signedInAs("u-bad-input", ADMIN);

    const empty = await post({ title: "   ", left: { name: "Claude", color: "blue" } });
    expect(empty.status).toBe(400);
    expect((await empty.json()).message).toMatch(/标题是空的/);

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
    // Only one quota today; if the previous call had been counted, this one would get a 429
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

    // One click burns one quota: exactly one request goes to Replicate
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
    // Hold the first request at the upstream step
    await Promise.resolve();
    const second = await post({ ...ONE, title: "狗" });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("busy");

    release();
    expect((await first).status).toBe(200);
    // Once it finishes, generating works again
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

  it("账号单设了额度就用它的，不看全局默认", async () => {
    vi.stubEnv("COVER_GENERATE_DAILY_LIMIT", "5");
    vi.stubGlobal("fetch", okFetch());
    signedInAs("u-own-limit", "someone@example.com", { permissions: ["ai_cover"], aiCoverDailyLimit: 1 });

    expect((await post(ONE)).status).toBe(200);
    const res = await post(ONE);
    expect(res.status).toBe(429);
    expect((await res.json()).message).toContain("每天 1 次");
  });
});
