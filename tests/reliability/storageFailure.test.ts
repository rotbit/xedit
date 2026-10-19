/**
 * The bottom line when local storage can't be written (quota full): no exceptions, no half-written mirror,
 * and the persisted baseline isn't advanced — the content is still in the editor, and the next autosave retries.
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
    expect(fetchMock).not.toHaveBeenCalled(); // Not even written locally, so don't push to the cloud
    const after = mods.getMirrorMeta("d1")!;
    expect(after.rev).toBe(1); // Not a single byte of the index changed
    expect(after.title).toBe("长文");
    expect(mods.getMirrorContent("d1")).toBe("第一版");
    // The persisted baseline wasn't advanced: the next autosave will save the 「第二版」 (second version) again
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

    // Nobody handles rejections on the autosave path, so this must honestly resolve(false)
    await expect(mods.pushMirrorDoc("d1")).resolves.toBe(false);
    storage.failSetIf = null;
    expect(mods.getMirrorMeta("d1")!.dirty).toBe(true);
  });
});
