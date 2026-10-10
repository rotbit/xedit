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
  end: null,
  checked: false,
  repeat: null,
  source: "doc",
  link: null,
  ...over,
});

describe("bucketTodos", () => {
  it("逾期 / 今天（含无日期 notes） / 其余折叠 / 已完成", () => {
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
    expect(b.today.map((i) => i.key)).toEqual(["c", "d"]);
    expect(b.later.map((i) => i.key)).toEqual(["g", "f", "e"]);
    expect(b.done.map((i) => i.key)).toEqual(["h"]);
    expect(actionableCount(b)).toBe(4);
  });

  it("时间段：进行中归今天、过了结束日才逾期、还没开始归以后", () => {
    const items = [
      item({ key: "doing", due: "2026-10-06", end: "2026-10-10" }),
      item({ key: "lastDay", due: "2026-10-05", end: T }),
      item({ key: "firstDay", due: T, end: "2026-10-12" }),
      item({ key: "late", due: "2026-10-01", end: "2026-10-07" }),
      item({ key: "soon", due: "2026-10-09", end: "2026-10-12" }),
      item({ key: "doneRange", due: "2026-10-01", end: "2026-10-03", checked: true }),
    ];
    const b = bucketTodos(items, T);
    expect(b.today.map((i) => i.key)).toEqual(["doing", "lastDay", "firstDay"]);
    expect(b.overdue.map((i) => i.key)).toEqual(["late"]);
    expect(b.later.map((i) => i.key)).toEqual(["soon"]);
    expect(b.done.map((i) => i.key)).toEqual(["doneRange"]);
  });
});

describe("每日任务分桶", () => {
  it("今天没做在今天、做了在已完成，从不逾期、不进以后", () => {
    saveMirrorLocal("r", {
      title: "待办清单",
      content: `---\ntype: todo\n---\n- [x] 跑步 @每天:2026-10-01\n- [x] 背单词 @daily:${T}\n- [ ] 读书 @每天\n`,
    });
    const items = collectTodos(listMirrorDocs(), T).filter((i) => i.docId === "r");
    expect(items.map((i) => [i.text, i.repeat, i.due, i.end, i.checked])).toEqual([
      ["跑步", "daily", T, null, false],
      ["背单词", "daily", T, null, true],
      ["读书", "daily", T, null, false],
    ]);
    // 换一天再算：昨天做了的今天又回到没做
    const tomorrow = collectTodos(listMirrorDocs(), "2026-10-09").filter((i) => i.docId === "r");
    const b = bucketTodos(tomorrow, "2026-10-09");
    expect(b.today.map((i) => i.text)).toEqual(["跑步", "背单词", "读书"]);
    expect(b.overdue.length + b.later.length + b.done.length).toBe(0);

    const bt = bucketTodos(items, T);
    expect(bt.today.map((i) => i.text)).toEqual(["跑步", "读书"]);
    expect(bt.done.map((i) => i.text)).toEqual(["背单词"]);
    expect(bt.overdue.length + bt.later.length).toBe(0);
  });
});

describe("collectTodos", () => {
  const docs = (): DocMeta[] => listMirrorDocs();

  it("三种来源、跳过模板、published 不再生成", () => {
    saveMirrorLocal("a", { title: "长文", content: "- [ ] 改标题 @今天\n- [x] 配图\n" });
    saveMirrorLocal("n", { title: "待办清单", content: "---\ntype: todo\n---\n\n- [ ] 买书\n- [ ] 补数据 [[a]] @今天\n" });
    saveMirrorLocal("p", { title: "新品", content: "---\npublish: 2026-10-12\n---\n正文" });
    saveMirrorLocal("q", { title: "旧闻", content: "---\npublish: 2026-10-01\npublished: true\n---\n" });
    saveMirrorLocal("t", { title: "模板", category: "模板", content: "- [ ] 检查错别字\n" });
    const items = collectTodos(docs(), T);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(Object.keys(byKey).sort()).toEqual(["a:0", "a:1", "n:4", "n:5", "p:-1"]);
    expect(byKey["a:0"]).toMatchObject({ source: "doc", text: "改标题", due: T, docTitle: "长文" });
    expect(byKey["a:1"].checked).toBe(true);
    expect(byKey["n:4"]).toMatchObject({ source: "notes", text: "买书", link: null });
    expect(byKey["n:5"]).toMatchObject({ source: "notes", text: "补数据", link: "a", due: T });
    expect(byKey["a:0"].link).toBeNull();
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
