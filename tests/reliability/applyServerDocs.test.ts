/**
 * 整批落镜像：一次全量同步几百篇，索引只能读写一次、列表只能刷新一次，
 * 重复的一批不该白写正文；单篇写失败（配额满）也不能连累其余篇。
 */
import { describe, expect, it, vi } from "vitest";
import { applyServerDocs, getMirrorContent, getMirrorMeta, listMirrorDocs } from "@/lib/docStore";
import { DOCS_CHANGED_EVENT } from "@/lib/localDocs";
import { storage } from "../setup";

/** 与 docStore 内部保持一致：索引一个 key，正文按 id 分 key */
const INDEX_KEY = "xedit-mirror-index";
const DOC_PREFIX = "xedit-mirror-doc:";

const makeDocs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `doc-${i}`,
    title: `第 ${i} 篇`,
    category: "随笔",
    content: `正文 ${i}`,
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));

/** 统计这一段代码里索引 key 的读写次数与列表刷新广播次数 */
function measure(run: () => void) {
  const getSpy = vi.spyOn(storage, "getItem");
  const setSpy = vi.spyOn(storage, "setItem");
  let notified = 0;
  const onChanged = () => notified++;
  window.addEventListener(DOCS_CHANGED_EVENT, onChanged);
  try {
    run();
  } finally {
    window.removeEventListener(DOCS_CHANGED_EVENT, onChanged);
  }
  const keysOf = (calls: readonly unknown[][]) => calls.map((c) => c[0] as string);
  const gets = keysOf(getSpy.mock.calls);
  const sets = keysOf(setSpy.mock.calls);
  const result = {
    indexGets: gets.filter((k) => k === INDEX_KEY).length,
    indexSets: sets.filter((k) => k === INDEX_KEY).length,
    contentSets: sets.filter((k) => k.startsWith(DOC_PREFIX)).length,
    notified,
  };
  getSpy.mockRestore();
  setSpy.mockRestore();
  return result;
}

describe("applyServerDocs", () => {
  it("100 篇一批：索引读写各一次，列表只刷新一次", () => {
    const docs = makeDocs(100);
    let applied = 0;
    const stats = measure(() => {
      applied = applyServerDocs(docs).applied;
    });
    expect(applied).toBe(100);
    expect(stats.indexGets).toBe(1);
    expect(stats.indexSets).toBe(1);
    expect(stats.notified).toBe(1);
    expect(listMirrorDocs()).toHaveLength(100);
    expect(getMirrorContent("doc-42")).toBe("正文 42");
  });

  it("同一批再来一次：没有变化就一个字节都不写", () => {
    const docs = makeDocs(20);
    applyServerDocs(docs);
    let result = { applied: -1, skipped: -1, failed: [] as string[] };
    const stats = measure(() => {
      result = applyServerDocs(docs);
    });
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(20);
    expect(stats.contentSets).toBe(0);
    expect(stats.indexSets).toBe(0);
    expect(stats.notified).toBe(0);
  });

  it("本地有未推送改动的那篇跳过，本地优先", async () => {
    const { saveMirrorLocal } = await import("@/lib/docStore");
    const docs = makeDocs(3);
    applyServerDocs(docs);
    saveMirrorLocal("doc-1", { content: "我刚改的" });
    const next = docs.map((d) => ({ ...d, content: `${d.content} 云端版`, updatedAt: "2026-02-02T00:00:00.000Z" }));
    const result = applyServerDocs(next);
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(1);
    expect(getMirrorContent("doc-1")).toBe("我刚改的");
    expect(getMirrorMeta("doc-1")!.dirty).toBe(true);
  });

  it("单篇正文写失败：记进 failed，其余篇照常写入，索引里没有失败那篇", () => {
    const docs = makeDocs(5);
    storage.failSetIf = (key) => key === `${DOC_PREFIX}doc-2`;
    const result = applyServerDocs(docs);
    storage.failSetIf = null;

    expect(result.failed).toEqual(["doc-2"]);
    expect(result.applied).toBe(4);
    expect(getMirrorMeta("doc-2")).toBeNull();
    expect(getMirrorMeta("doc-3")!.title).toBe("第 3 篇");
    expect(getMirrorContent("doc-4")).toBe("正文 4");
  });
});
