import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetAiConfigForTests,
  readAiConfig,
  writeAiConfig,
} from "@/features/review/aiConfig";
import { AiReviewError, requestAiReview, runReview } from "@/features/review/aiReview";

/**
 * 网页这头发出去的那一次请求：发对了什么、没发什么、服务端回的错怎么传到界面上。
 *
 * 全程假 fetch——真打一趟要钱要等，而要验的东西（body 里有没有 kind、
 * 请求体里有没有混进 key、401 的说法有没有原样带上来）都在报文里。
 * 还有一条是这一版新钉的：没 key 也不许偷偷退回本地假数据，该报错就报错。
 */

const CONTENT = "# 标题\n\n正文里有一句想让人挑挑毛病的话。";

const ok = (over: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({ summary: "还行", categories: [], items: [], ...over }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

const fail = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** 记下每次调用的假 fetch；按顺序返回预备好的响应 */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    const next = responses.shift();
    if (!next) throw new Error("假 fetch 被多调了一次");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", impl);
  return calls;
}

beforeEach(() => {
  __resetAiConfigForTests();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("发出去的那一次请求", () => {
  it("打本站的接口，把正文、审核类型、哪家哪个模型都带上", async () => {
    const calls = fakeFetch(ok());
    writeAiConfig({ kind: "wechat_rules" });
    await requestAiReview(CONTENT, readAiConfig());
    expect(calls[0].url).toBe("/api/ai/review");
    expect(calls[0].body.content).toBe(CONTENT);
    expect(calls[0].body.kind).toBe("wechat_rules");
  });

  it("请求体里只有正文和审核类型：模型和 key 都由后台定，前端不报", async () => {
    const calls = fakeFetch(ok());
    await requestAiReview(CONTENT, readAiConfig());
    expect(Object.keys(calls[0].body).sort()).toEqual(["content", "kind"]);
  });

  it("runReview 现读本机设置：在面板里改完再点「重新审核」，用的是新设置", async () => {
    const calls = fakeFetch(ok(), ok());
    writeAiConfig({ kind: "expression" });
    await runReview(CONTENT);
    expect(calls[0].body.kind).toBe("expression");

    writeAiConfig({ kind: "wechat_rules" });
    await runReview(CONTENT);
    expect(calls[1].body.kind).toBe("wechat_rules");
  });

});

describe("没 key / 出错时", () => {
  it("没 key 也照样是真请求，不再退回本地造的假数据", async () => {
    const calls = fakeFetch(fail(503, { error: "no_key", message: "还没配 API Key" }));
    await expect(runReview(CONTENT)).rejects.toThrow("还没配 API Key");
    expect(calls).toHaveLength(1);
  });

  it("服务端的错误码原样带上来，界面据此分流（no_key 要引去换一家模型）", async () => {
    fakeFetch(fail(401, { error: "bad_key", message: "这把 Key 不对" }));
    const err = await runReview(CONTENT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiReviewError);
    expect((err as AiReviewError).code).toBe("bad_key");
    expect((err as AiReviewError).message).toBe("这把 Key 不对");
  });

  it("服务端没给说法时也得有句能看的话，别弹一个空白提示", async () => {
    fakeFetch(fail(500, {}));
    const err = (await runReview(CONTENT).catch((e: unknown) => e)) as AiReviewError;
    expect(err.message).toContain("500");
    expect(err.code).toBe("failed");
  });

  it("连不上就说连不上，不跟「模型没回好」混在一起", async () => {
    fakeFetch(new TypeError("Failed to fetch"));
    const err = (await runReview(CONTENT).catch((e: unknown) => e)) as AiReviewError;
    expect(err.code).toBe("offline");
  });

  it("用户退出审核造成的 abort 原样往上抛：那不是错误，界面不该弹提示", async () => {
    fakeFetch(new DOMException("aborted", "AbortError"));
    const err = (await runReview(CONTENT).catch((e: unknown) => e)) as DOMException;
    expect(err).not.toBeInstanceOf(AiReviewError);
    expect(err.name).toBe("AbortError");
  });

  it("回来的东西缺胳膊少腿就当没成功，不拿去渲染卡片", async () => {
    fakeFetch(ok({ items: "一堆" }));
    const err = (await runReview(CONTENT).catch((e: unknown) => e)) as AiReviewError;
    expect(err.code).toBe("failed");
  });
});
