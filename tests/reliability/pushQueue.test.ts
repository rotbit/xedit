/**
 * 推送队列的可靠性：单飞、旧响应不清新编辑、文档之间互不串台、
 * 有界重试后保留 dirty、换账号后在途响应作废。
 * 被测的是 src 下的真实模块；sync.ts 有模块级队列，每个用例重置模块后再动态引入。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/Toast", () => ({ toast: vi.fn() }));

/** 只实现被测代码用到的那几个字段，避免依赖运行时的 Response 实现 */
function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** 让已排队的微任务跑完（fetch 回调、await 链） */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function load() {
  vi.resetModules();
  // 三个模块必须在同一次重置后引入：sessionEpoch 有模块级代际，分属两份注册表就对不上
  const [sync, docStore, epoch] = await Promise.all([
    import("@/lib/sync"),
    import("@/lib/docStore"),
    import("@/lib/sessionEpoch"),
  ]);
  return { ...sync, ...docStore, ...epoch };
}

describe("推送队列", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("在途响应回来时本地又改了：不清 dirty，只更新冲突基线，下一轮把新内容推上去", async () => {
    const { saveMirrorLocal, getMirrorMeta, pushMirrorDoc } = await load();
    saveMirrorLocal("d1", { title: "标题", content: "v1", category: "笔记" });

    const pending: Array<(res: Response) => void> = [];
    const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<Response>>(
      () => new Promise<Response>((resolve) => pending.push(resolve))
    );
    vi.stubGlobal("fetch", fetchMock);

    const push = pushMirrorDoc("d1");
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 请求还在飞的时候用户又敲了几个字
    saveMirrorLocal("d1", { content: "v2" });
    void pushMirrorDoc("d1"); // 同一篇：不开第二个请求，只标记「回来再跑一轮」
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending[0](jsonRes({ ok: true, updatedAt: "2026-01-01T00:00:00.000Z" }));
    await tick();

    const midway = getMirrorMeta("d1")!;
    expect(midway.dirty).toBe(true); // v2 还没上云
    expect(midway.baseUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledTimes(2); // again 轮已发出

    const second = JSON.parse(fetchMock.mock.calls[1][1].body) as {
      content: string;
      baseUpdatedAt?: string;
    };
    expect(second.content).toBe("v2");
    expect(second.baseUpdatedAt).toBe("2026-01-01T00:00:00.000Z");

    pending[1](jsonRes({ ok: true, updatedAt: "2026-01-01T00:05:00.000Z" }));
    await expect(push).resolves.toBe(true);
    const done = getMirrorMeta("d1")!;
    expect(done.dirty).toBe(false);
    expect(done.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("A 的响应不会动到 B 的状态", async () => {
    const { saveMirrorLocal, getMirrorMeta, pushMirrorDoc } = await load();
    saveMirrorLocal("a", { content: "a1" });
    saveMirrorLocal("b", { content: "b1" });

    const pending = new Map<string, (res: Response) => void>();
    const fetchMock = vi.fn(
      (url: string) => new Promise<Response>((resolve) => pending.set(url, resolve))
    );
    vi.stubGlobal("fetch", fetchMock);

    const pa = pushMirrorDoc("a");
    const pb = pushMirrorDoc("b");
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    pending.get("/api/documents/b")!(jsonRes({ ok: true, updatedAt: "2026-02-02T00:00:00.000Z" }));
    await expect(pb).resolves.toBe(true);
    expect(getMirrorMeta("b")!.dirty).toBe(false);
    expect(getMirrorMeta("a")!.dirty).toBe(true); // A 还在飞，没被 B 的响应捎带清掉
    expect(getMirrorMeta("a")!.baseUpdatedAt).toBeUndefined();

    pending.get("/api/documents/a")!(jsonRes({ ok: true, updatedAt: "2026-02-02T00:01:00.000Z" }));
    await expect(pa).resolves.toBe(true);
    expect(getMirrorMeta("a")!.dirty).toBe(false);
    expect(getMirrorMeta("a")!.updatedAt).toBe("2026-02-02T00:01:00.000Z");
    expect(getMirrorMeta("b")!.updatedAt).toBe("2026-02-02T00:00:00.000Z");
  });

  it("网络异常：重试两次后放弃，dirty 留着，下次调用重新推", async () => {
    const { saveMirrorLocal, getMirrorMeta, pushMirrorDoc } = await load();
    saveMirrorLocal("d1", { content: "v1" });

    const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const push = pushMirrorDoc("d1");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await expect(push).resolves.toBe(false);
    expect(getMirrorMeta("d1")!.dirty).toBe(true);

    // 下一次触发（同步引擎 / 再次保存）还会接着推
    const again = pushMirrorDoc("d1");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(again).resolves.toBe(false);
    vi.useRealTimers();
  });

  it("4xx 不重试，dirty 保留", async () => {
    const { saveMirrorLocal, getMirrorMeta, pushMirrorDoc } = await load();
    saveMirrorLocal("d1", { content: "v1" });
    const fetchMock = vi.fn(async () => jsonRes({ error: "只读模式" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pushMirrorDoc("d1")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getMirrorMeta("d1")!.dirty).toBe(true);
  });

  it("换账号后在途响应作废：镜像一个字节都不写", async () => {
    const { saveMirrorLocal, getMirrorMeta, pushMirrorDoc, bumpSessionEpoch } = await load();
    saveMirrorLocal("d1", { content: "v1" });
    const before = getMirrorMeta("d1")!;

    const pending: Array<(res: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)))
    );

    const push = pushMirrorDoc("d1");
    await tick();
    bumpSessionEpoch(); // 登出 / 换账号
    pending[0](jsonRes({ ok: true, updatedAt: "2026-03-03T00:00:00.000Z" }));

    await expect(push).resolves.toBe(false);
    const after = getMirrorMeta("d1")!;
    expect(after.dirty).toBe(true);
    expect(after.baseUpdatedAt).toBeUndefined();
    expect(after.updatedAt).toBe(before.updatedAt);
  });
});
