import { describe, expect, it } from "vitest";
import { storage } from "../../setup";
import { saveMirrorLocal, listMirrorDocs } from "@/lib/docStore";
import { actionableCount, bucketTodos, collectTodos, findNotesDoc, pruneTodoCache, type TodoItem } from "@/lib/todos/collect";
import type { DocMeta } from "@/features/workspace/types";

const T = "2026-10-08";

const item = (over: Partial<TodoItem>): TodoItem => ({
  key: "d:0",
  docId: "d",
  docTitle: "文",
  line: 0,
  text: "x",
  due: null,
  checked: false,
  source: "doc",
  ...over,
});

describe("bucketTodos", () => {
  it("逾期 / 今天 / 无日期 notes / 其余折叠 / 已完成", () => {
    const items = [
      item({ key: "a", due: "2026-10-06" }),
      item({ key: "b", due: "2026-10-01", source: "notes" }),
      item({ key: "c", due: T }),
      item({ key: "d", source: "notes" }),
      item({ key: "e" }),
      item({ key: "f", due: "2026-10-20", source: "notes" }),
      item({ key: "g", due: "2026-10-10", source: "publish", line: -1 }),
      item({ key: "h", due: "2026-10-01", checked: true }),
    ];
    const b = bucketTodos(items, T);
    expect(b.overdue.map((i) => i.key)).toEqual(["b", "a"]);
    expect(b.today.map((i) => i.key)).toEqual(["c"]);
    expect(b.undated.map((i) => i.key)).toEqual(["d"]);
    expect(b.later.map((i) => i.key)).toEqual(["g", "f", "e"]);
    expect(b.done.map((i) => i.key)).toEqual(["h"]);
    expect(actionableCount(b)).toBe(4);
  });
});

describe("collectTodos", () => {
  const docs = (): DocMeta[] => listMirrorDocs();

  it("三种来源、跳过模板、published 不再生成", () => {
    saveMirrorLocal("a", { title: "长文", content: "- [ ] 改标题 @今天\n- [x] 配图\n" });
    saveMirrorLocal("n", { title: "待办清单", content: "---\ntype: todo\n---\n\n- [ ] 买书\n" });
    saveMirrorLocal("p", { title: "新品", content: "---\npublish: 2026-10-12\n---\n正文" });
    saveMirrorLocal("q", { title: "旧闻", content: "---\npublish: 2026-10-01\npublished: true\n---\n" });
    saveMirrorLocal("t", { title: "模板", category: "模板", content: "- [ ] 检查错别字\n" });
    const items = collectTodos(docs(), T);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(Object.keys(byKey).sort()).toEqual(["a:0", "a:1", "n:4", "p:-1"]);
    expect(byKey["a:0"]).toMatchObject({ source: "doc", text: "改标题", due: T, docTitle: "长文" });
    expect(byKey["a:1"].checked).toBe(true);
    expect(byKey["n:4"]).toMatchObject({ source: "notes", text: "买书" });
    expect(byKey["p:-1"]).toMatchObject({ source: "publish", text: "发布《新品》", due: "2026-10-12", line: -1 });
    expect(findNotesDoc(docs())?.id).toBe("n");
  });

  it("元信息没变不重读正文；变了才重读；日期标签按传入的今天现算", () => {
    saveMirrorLocal("c1", { title: "a", content: "- [ ] 事 @明天\n" });
    pruneTodoCache(["c1"]);
    const list = docs();
    collectTodos(list, T);
    storage.resetStats();
    const again = collectTodos(list, "2026-10-09");
    // 元信息没变：正文一次没读
    expect(storage.stats.get).toBe(0);
    expect(again[0].due).toBe("2026-10-10");

    saveMirrorLocal("c1", { content: "- [ ] 新事\n" });
    expect(collectTodos(docs(), T)[0].text).toBe("新事");
  });
});
