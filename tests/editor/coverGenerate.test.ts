import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COVER_COUNT,
  CoverGenerateError,
  coverServiceState,
  dataUrlToFile,
  generateCovers,
  isCoverColor,
} from "@/features/editor/lib/coverGenerate";

/** 大多数用例不关心填了什么：一个标题 + 一个产品就够发请求了 */
const ONE = { title: "两家大模型谁更能写", left: { name: "Claude", color: "orange" } } as const;

/** 只桩 generateCovers / coverServiceState 用得到的那几个字段 */
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("coverServiceState", () => {
  it("站点配了生图 Token，管理员才算可用", async () => {
    const fetchMock = mockFetch(() => reply(200, { coverGenerate: true }));
    await expect(coverServiceState(true)).resolves.toBe("ready");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/config");
  });

  it("配了但不是管理员：没资格，不是没配置", async () => {
    mockFetch(() => reply(200, { coverGenerate: true }));
    await expect(coverServiceState(false)).resolves.toBe("forbidden");
  });

  it("站点没配就先说没配，管理员也一样——先提权限再说没配置是白折腾", async () => {
    mockFetch(() => reply(200, { coverGenerate: false }));
    await expect(coverServiceState(true)).resolves.toBe("unconfigured");
    mockFetch(() => reply(200, {}));
    await expect(coverServiceState(false)).resolves.toBe("unconfigured");
  });

  it("连不上、或答的不是 JSON，都按够不着服务器处理", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(coverServiceState(true)).resolves.toBe("offline");
    mockFetch(() => ({ ok: true, status: 200, json: () => Promise.reject(new Error("not json")) }));
    await expect(coverServiceState(true)).resolves.toBe("offline");
    mockFetch(() => reply(404, {}));
    await expect(coverServiceState(true)).resolves.toBe("offline");
  });
});

describe("generateCovers", () => {
  it("按契约发 POST：默认两张，没填的重点词和产品 B 干脆不发", async () => {
    const fetchMock = mockFetch(() => reply(200, { images: ["data:image/png;base64,AA"] }));
    await expect(generateCovers({ ...ONE })).resolves.toEqual(["data:image/png;base64,AA"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // 同源，浏览器自己带登录 cookie
    expect(url).toBe("/api/cover/generate");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      title: "两家大模型谁更能写",
      left: { name: "Claude", color: "orange" },
      count: COVER_COUNT,
    });
  });

  it("填了重点词和产品 B 就一起发过去", async () => {
    const fetchMock = mockFetch(() => reply(200, { images: ["data:image/png;base64,AA"] }));
    await generateCovers({
      ...ONE,
      highlights: ["更能写", "更便宜"],
      right: { name: "GPT", color: "green" },
      count: 1,
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      title: "两家大模型谁更能写",
      highlights: ["更能写", "更便宜"],
      left: { name: "Claude", color: "orange" },
      right: { name: "GPT", color: "green" },
      count: 1,
    });
  });

  it("非 2xx：把服务端给的 message 与 code 一起抛出来", async () => {
    mockFetch(() => reply(502, { error: "upstream", message: "生图服务暂时不可用" }));
    await expect(generateCovers({ ...ONE })).rejects.toMatchObject({
      message: "生图服务暂时不可用",
      code: "upstream",
    });
  });

  it("403 / 429 都原样显示服务端的说法，code 留给界面分流", async () => {
    mockFetch(() => reply(403, { error: "forbidden", message: "AI 生成封面目前只对管理员开放" }));
    await expect(generateCovers({ ...ONE })).rejects.toMatchObject({
      message: "AI 生成封面目前只对管理员开放",
      code: "forbidden",
    });
    mockFetch(() =>
      reply(429, { error: "rate_limited", message: "今天的 AI 生成封面次数用完了（每天 20 次），明天再来" })
    );
    await expect(generateCovers({ ...ONE })).rejects.toThrow("今天的 AI 生成封面次数用完了");
  });

  it("非 2xx 又没 message：退回带状态码的一句话", async () => {
    mockFetch(() => reply(500, { error: "boom" }));
    await expect(generateCovers({ ...ONE })).rejects.toThrow("生成失败（500）");
  });

  it("答了 200 却没有图（或不是 dataURL）也算失败", async () => {
    mockFetch(() => reply(200, { images: [] }));
    await expect(generateCovers({ ...ONE })).rejects.toThrow("服务没有返回图片");
    mockFetch(() => reply(200, { images: ["https://a.com/x.png"] }));
    await expect(generateCovers({ ...ONE })).rejects.toThrow("服务没有返回图片");
  });

  it("连不上服务器：报「连不上」，不是光秃秃的 Failed to fetch", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const err = await generateCovers({ ...ONE }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CoverGenerateError);
    expect((err as CoverGenerateError).code).toBe("offline");
    expect((err as CoverGenerateError).message).toBe("现在连不上服务器，稍后再试");
  });

  it("abort 原样往上抛：界面据此区分「用户关了面板」和真出错", async () => {
    mockFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(generateCovers({ ...ONE })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("isCoverColor", () => {
  it("只认白名单里的色号：本地存的那份可能是旧版或被人改过", () => {
    expect(isCoverColor("orange")).toBe(true);
    expect(isCoverColor("gray")).toBe(true);
    for (const bad of ["", "ORANGE", "#f00", null, undefined, 1, {}]) {
      expect(isCoverColor(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("dataUrlToFile", () => {
  it("base64 的图：按 mime 定扩展名，内容不变", async () => {
    const file = dataUrlToFile(`data:image/jpeg;base64,${btoa("hello")}`);
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toMatch(/^cover-\d+\.jpg$/);
    expect(await file.text()).toBe("hello");
  });

  it("不认识的 mime 退回 png，文件名可以自己指定", () => {
    expect(dataUrlToFile("data:image/avif;base64,AAAA", "x.bin").name).toBe("x.bin");
    expect(dataUrlToFile(`data:image/avif;base64,${btoa("a")}`).name).toMatch(/\.png$/);
  });

  it("没有 base64 标记的（如 svg）按百分号编码解", async () => {
    const file = dataUrlToFile("data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E");
    expect(file.type).toBe("image/svg+xml");
    expect(await file.text()).toBe("<svg></svg>");
  });

  it("不是 dataURL 就直接报错", () => {
    expect(() => dataUrlToFile("https://a.com/x.png")).toThrow("不是图片数据");
  });
});
