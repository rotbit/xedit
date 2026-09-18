/**
 * 本地存储写不进去（配额满）时的底线：不抛异常、不把镜像写成半截、
 * 不推平落盘基准——内容还在编辑器里，下一次自动保存接着试。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "../setup";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/components/Toast", () => ({ toast: toastSpy }));

const DOC_PREFIX = "xedit-mirror-doc:";
const INDEX_KEY = "xedit-mirror-index";

function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

async function load() {
  vi.resetModules();
  const [persistence, docStore, sync] = await Promise.all([
    import("@/lib/editor/persistence"),
    import("@/lib/docStore"),
    import("@/lib/sync"),
  ]);
  return { ...persistence, ...docStore, ...sync };
}

describe("存储写失败", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    toastSpy.mockClear();
  });

  it("正文写不进去：返回 local-error，索引没被写坏（rev 不动）", async () => {
    const mods = await load();
    mods.saveMirrorLocal("d1", { title: "长文", content: "第一版", category: "随笔" });
    const before = mods.getMirrorMeta("d1")!;
    expect(before.rev).toBe(1);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    storage.failSetIf = (key) => key === `${DOC_PREFIX}d1`;

    const result = await mods.persistEditorDocument(
      { docId: "d1", title: "长文", content: "第二版", category: "随笔" },
      () => {}
    );
    storage.failSetIf = null;

    expect(result).toBe("local-error");
    expect(fetchMock).not.toHaveBeenCalled(); // 本地都没写成，别推上云
    const after = mods.getMirrorMeta("d1")!;
    expect(after.rev).toBe(1); // 索引一个字节都没动
    expect(after.title).toBe("长文");
    expect(mods.getMirrorContent("d1")).toBe("第一版");
    // 落盘基准没被推平：下一次自动保存还会把「第二版」再存一遍
    expect(
      mods.isDocumentSaved({ docId: "d1", title: "长文", content: "第二版", category: "随笔" })
    ).toBe(false);
  });

  it("索引写不进去：一样是 local-error，不会抛到调用方", async () => {
    const mods = await load();
    mods.saveMirrorLocal("d1", { title: "长文", content: "第一版", category: "随笔" });
    vi.stubGlobal("fetch", vi.fn());
    storage.failSetIf = (key) => key === INDEX_KEY;

    await expect(
      mods.persistEditorDocument(
        { docId: "d1", title: "长文", content: "第二版", category: "随笔" },
        () => {}
      )
    ).resolves.toBe("local-error");
    storage.failSetIf = null;
  });

  it("推送回来写索引失败：不抛异常、不留未处理 rejection，dirty 照旧", async () => {
    const mods = await load();
    mods.saveMirrorLocal("d1", { title: "长文", content: "第一版", category: "随笔" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({ ok: true, updatedAt: "2026-07-01T00:00:00.000Z" }))
    );
    storage.failSetIf = (key) => key === INDEX_KEY;

    // 自动保存那条链路没人接 reject，这里必须是老老实实地 resolve(false)
    await expect(mods.pushMirrorDoc("d1")).resolves.toBe(false);
    storage.failSetIf = null;
    expect(mods.getMirrorMeta("d1")!.dirty).toBe(true);
  });
});
