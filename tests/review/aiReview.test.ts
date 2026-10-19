import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetAiConfigForTests,
  readAiConfig,
  writeAiConfig,
} from "@/features/review/aiConfig";
import { AiReviewError, requestAiReview, runReview } from "@/features/review/aiReview";
import { formatRecordTime } from "@/features/review/history";

/**
 * The one request the web client sends: what it sends correctly, what it doesn't send, and how server errors reach the UI.
 *
 * Fake fetch throughout — a real call costs money and time, and what we want to verify (whether body has kind,
 * whether a key slipped into the request body, whether the 401 message comes through verbatim) is all in the request/response.
 * One more is newly pinned in this version: without a key it must not quietly fall back to local fake data; it should error.
 */

const CONTENT = "# 标题\n\n正文里有一句想让人挑挑毛病的话。";

const ok = (over: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({ summary: "还行", categories: [], items: [], ...over }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

const fail = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Fake fetch that records every call and returns the prepared responses in order */
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

describe("审核历史：回包里的 record、回看时的时间", () => {
  it("带了 docId 才报上去；服务端替这一趟存的那条记录原样带回来", async () => {
    const record = { id: "r1", createdAt: "2026-09-20T02:00:00.000Z", kinds: ["expression"], model: "m", total: 0 };
    const calls = fakeFetch(ok({ record }), ok());
    const run = await requestAiReview(CONTENT, readAiConfig(), undefined, "doc-1");
    expect(calls[0].body.docId).toBe("doc-1");
    expect(run.record).toEqual(record);
    expect(run.result.summary).toBe("还行");
    // Not saved (or an old server): suggestions still returned, record is null
    expect((await requestAiReview(CONTENT, readAiConfig())).record).toBeNull();
  });

  it("时间说人话：今天的只说几点，今年的不带年份", () => {
    const now = new Date(2026, 8, 20, 18, 0);
    expect(formatRecordTime(new Date(2026, 8, 20, 9, 5).toISOString(), now)).toBe("今天 09:05");
    expect(formatRecordTime(new Date(2026, 7, 3, 14, 30).toISOString(), now)).toBe("8月3日 14:30");
    expect(formatRecordTime(new Date(2025, 11, 31, 8, 0).toISOString(), now)).toBe("2025年12月31日");
    expect(formatRecordTime("不是时间", now)).toBe("");
  });
});

describe("发出去的那一次请求", () => {
  it("打本站的接口，把正文、审核类型、哪家哪个模型都带上", async () => {
    const calls = fakeFetch(ok());
    writeAiConfig({ kinds: ["expression", "wechat_rules"] });
    await requestAiReview(CONTENT, readAiConfig());
    expect(calls[0].url).toBe("/api/ai/review");
    expect(calls[0].body.content).toBe(CONTENT);
    expect(calls[0].body.kinds).toEqual(["expression", "wechat_rules"]);
  });

  it("请求体里只有正文和审核类型：模型和 key 都由后台定，前端不报", async () => {
    const calls = fakeFetch(ok());
    await requestAiReview(CONTENT, readAiConfig());
    expect(Object.keys(calls[0].body).sort()).toEqual(["content", "kinds"]);
  });

  it("runReview 现读本机设置：在面板里改完再点「重新审核」，用的是新设置", async () => {
    const calls = fakeFetch(ok(), ok());
    writeAiConfig({ kinds: ["expression"] });
    await runReview(CONTENT);
    expect(calls[0].body.kinds).toEqual(["expression"]);

    writeAiConfig({ kinds: ["wechat_rules"] });
    await runReview(CONTENT);
    expect(calls[1].body.kinds).toEqual(["wechat_rules"]);
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
