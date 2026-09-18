/**
 * 侧栏搜索的性能与语义回归。
 * 正文读取整条换成内存桩：这里要量的是「命中判定 + 摘要」这段算力，
 * 而不是 localStorage 的快慢；顺带让 getDocContent 的调用次数可数。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { contents, reads } = vi.hoisted(() => ({
  contents: new Map<string, string>(),
  reads: { n: 0 },
}));

vi.mock("@/lib/docContent", () => ({
  getDocContent: (id: string) => {
    reads.n++;
    return contents.get(id) ?? "";
  },
}));

import { pruneIndex } from "@/lib/docIndex";
import { searchDocIds, searchDocs } from "@/lib/docSearch";
import type { DocMeta } from "@/features/workspace/types";

/** 被搜的词：只出现在正文里，逼着两条路径都把正文摊开比一遍 */
const KEYWORD = "光合作用";
const DOC_COUNT = 1000;

/** 固定生成的文库：内容长度、命中分布每次跑都一样，数字才可比 */
function makeDocs(n: number): DocMeta[] {
  const docs: DocMeta[] = [];
  for (let i = 0; i < n; i++) {
    const body =
      `# 第 ${i} 篇笔记\n\n` +
      "叶片在清晨展开，露水顺着叶脉滑到叶尖。".repeat(20) +
      `\n\n这一段讲的是${KEYWORD}与叶绿体的关系。\n\n` +
      "写作的时候不要急着下结论，先把观察记下来。".repeat(20);
    const id = `doc-${i}`;
    contents.set(id, body);
    docs.push({
      id,
      title: `观察笔记 ${i}`,
      updatedAt: new Date(1700000000000 + i * 1000).toISOString(),
      excerpt: body.slice(0, 90),
      chars: body.length,
    });
  }
  return docs;
}

const docs = makeDocs(DOC_COUNT);

/** 跑 rounds 轮取最快的一轮：单测机上别的进程会抖，最小值最接近真实开销 */
function fastest(rounds: number, fn: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

beforeEach(() => {
  pruneIndex([]); // 每个用例都从冷索引开始
  reads.n = 0;
});

describe("searchDocIds", () => {
  it("与 searchDocs 命中同一批文章", () => {
    const viaHits = new Set(
      searchDocs(docs, KEYWORD, { limit: docs.length }).map((h) => h.doc.id)
    );
    const viaIds = searchDocIds(docs, KEYWORD);
    expect(viaIds.size).toBe(DOC_COUNT);
    expect([...viaIds].sort()).toEqual([...viaHits].sort());
  });

  it("读正文的次数与 searchDocs 一致：省下的是摘要与排序，不是少搜了文章", () => {
    searchDocs(docs, KEYWORD, { limit: docs.length });
    const readsForHits = reads.n;

    pruneIndex([]);
    reads.n = 0;
    searchDocIds(docs, KEYWORD);
    expect(reads.n).toBe(readsForHits);
    expect(reads.n).toBe(DOC_COUNT);
  });

  it("热缓存后一次正文都不读", () => {
    searchDocIds(docs, KEYWORD);
    reads.n = 0;
    searchDocIds(docs, KEYWORD);
    expect(reads.n).toBe(0);
  });

  it(`${DOC_COUNT} 篇：不建摘要、不排序，比 searchDocs 快`, () => {
    searchDocIds(docs, KEYWORD); // 先热索引，两边量的都是命中判定本身
    const hitsMs = fastest(5, () => searchDocs(docs, KEYWORD, { limit: docs.length }));
    const idsMs = fastest(5, () => searchDocIds(docs, KEYWORD));
    console.log(
      `[perf] ${DOC_COUNT} 篇 / node: searchDocs ${hitsMs.toFixed(2)}ms → searchDocIds ${idsMs.toFixed(2)}ms`
    );
    expect(idsMs).toBeLessThan(hitsMs);
  });

  it("摘要只有 searchDocs 才建", () => {
    const [hit] = searchDocs(docs, KEYWORD, { limit: 1 });
    expect(hit.where).toBe("content");
    expect(hit.snippet).toContain(KEYWORD);
    expect(hit.ranges.length).toBeGreaterThan(0);
    // searchDocIds 的出口里根本没有摘要这回事
    expect([...searchDocIds(docs.slice(0, 1), KEYWORD)]).toEqual(["doc-0"]);
  });
});

describe("检索语义（两个出口同一套判定）", () => {
  const sample: DocMeta[] = [
    { id: "t1", title: "张三 专访", updatedAt: "2026-01-03T00:00:00.000Z", chars: 10 },
    { id: "t2", title: "普通标题", updatedAt: "2026-01-02T00:00:00.000Z", chars: 10 },
    { id: "t3", title: "李四", updatedAt: "2026-01-01T00:00:00.000Z", chars: 10 },
  ];
  contents.set("t1", "正文里没有别的关键词");
  contents.set("t2", "这里写了**采访**记录，提到张三当天迟到了");
  contents.set("t3", "参见 [[植物学笔记|绿叶]] 那一篇");

  it("多词 AND：词全中才算命中", () => {
    expect([...searchDocIds(sample, "张三 采访")]).toEqual(["t2"]);
    expect([...searchDocIds(sample, "张三 不存在的词")]).toEqual([]);
  });

  it("标题命中排前，且不必读正文", () => {
    const hits = searchDocs(sample, "张三", { limit: 10 });
    expect(hits[0].doc.id).toBe("t1");
    expect(hits[0].where).toBe("title");
    expect(hits[1].where).toBe("content"); // t2 的正文里也有张三
  });

  it("正文命中：Markdown 记号不挡路", () => {
    const hits = searchDocs(sample, "采访", { limit: 10 });
    expect(hits.map((h) => h.doc.id)).toEqual(["t2"]);
    expect(hits[0].where).toBe("content");
  });

  it("[[目标|显示]] 只按显示文字匹配", () => {
    expect([...searchDocIds(sample, "绿叶")]).toEqual(["t3"]);
    expect([...searchDocIds(sample, "植物学笔记")]).toEqual([]);
  });

  it("只打了空格：全部命中（与 searchDocs 的「列出全部」对齐）", () => {
    expect(searchDocIds(sample, "   ").size).toBe(sample.length);
  });
});
