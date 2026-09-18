/**
 * persist 拆分：设置存 xedit-store，文稿存 xedit-store-doc。
 * 每个用例都重新 import 一次 store —— 落盘与回读都发生在模块初始化那一刻。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "../setup";

const SETTINGS_KEY = "xedit-store";
const DOC_KEY = "xedit-store-doc";
/** 防抖落盘的间隔，比 useStore 里的 400ms 宽一点 */
const FLUSH_MS = 500;

async function freshStore() {
  vi.resetModules();
  const mod = await import("@/store/useStore");
  return mod.useStore;
}

/** 这一段里写过哪些键 */
function writtenKeys(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe("设置与文稿分开落盘", () => {
  it("改一次设置：文稿键一次都不写", async () => {
    const useStore = await freshStore();
    const spy = vi.spyOn(storage, "setItem");
    storage.resetStats();

    useStore.getState().setThemeId("ink");
    vi.advanceTimersByTime(FLUSH_MS);

    expect(writtenKeys(spy)).toEqual([SETTINGS_KEY]);
    expect(writtenKeys(spy).filter((k) => k === DOC_KEY)).toHaveLength(0);
    expect(storage.stats.set).toBe(1);
    expect(storage.getItem(DOC_KEY)).toBeNull();
  });

  it("敲字：只写文稿键，设置那份不跟着重写", async () => {
    const useStore = await freshStore();
    // 先让设置那份落一次盘（首次写不可避免），之后它的内容不再变
    useStore.getState().setThemeId("ink");
    vi.advanceTimersByTime(FLUSH_MS);

    const spy = vi.spyOn(storage, "setItem");
    storage.resetStats();
    useStore.getState().setContent("一二三四五");
    vi.advanceTimersByTime(FLUSH_MS);

    expect(writtenKeys(spy)).toEqual([DOC_KEY]);
    expect(storage.stats.set).toBe(1);
    expect(JSON.parse(storage.getItem(DOC_KEY)!)).toMatchObject({ content: "一二三四五" });
    // 设置那份里不该再有正文
    expect(storage.getItem(SETTINGS_KEY)).not.toContain("一二三四五");
  });

  it("连敲多下只落一次盘（400ms 防抖仍在）", async () => {
    const useStore = await freshStore();
    const spy = vi.spyOn(storage, "setItem");
    storage.resetStats();

    for (const text of ["一", "一二", "一二三"]) useStore.getState().setContent(text);
    vi.advanceTimersByTime(FLUSH_MS);

    expect(writtenKeys(spy).filter((k) => k === DOC_KEY)).toHaveLength(1);
    expect(JSON.parse(storage.getItem(DOC_KEY)!)).toMatchObject({ content: "一二三" });
  });

  it("老格式：正文还在 xedit-store 里时首次加载读得出，并当场搬到文稿键", async () => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 4,
        state: { themeId: "ink", title: "老标题", content: "老正文还在旧键里" },
      })
    );

    const useStore = await freshStore();
    expect(useStore.getState().content).toBe("老正文还在旧键里");
    expect(useStore.getState().title).toBe("老标题");
    expect(useStore.getState().themeId).toBe("ink"); // 设置照常回读
    expect(JSON.parse(storage.getItem(DOC_KEY)!)).toEqual({
      title: "老标题",
      content: "老正文还在旧键里",
    });

    // 之后设置再落盘，旧键里就不带正文了
    useStore.getState().setLinkFootnote(false);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(storage.getItem(SETTINGS_KEY)).not.toContain("老正文还在旧键里");
  });

  it("文稿键优先于旧键", async () => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 5, state: { title: "旧的", content: "旧正文" } })
    );
    storage.setItem(DOC_KEY, JSON.stringify({ title: "新的", content: "新正文" }));

    const useStore = await freshStore();
    expect(useStore.getState().content).toBe("新正文");
    expect(useStore.getState().title).toBe("新的");
  });

  it("写不进去（配额满）也不炸", async () => {
    const useStore = await freshStore();
    storage.failSetIf = (key) => key === DOC_KEY;

    expect(() => {
      useStore.getState().setContent("写不进去的正文");
      vi.advanceTimersByTime(FLUSH_MS);
    }).not.toThrow();
    expect(useStore.getState().content).toBe("写不进去的正文");
  });
});
