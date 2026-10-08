/**
 * 待办写回：走真实的本地文档存储（未登录 / 本地模式那条路），
 * 编辑器没挂着任何一篇，所以读写都直接落存储。
 */
import { describe, expect, it, vi } from "vitest";
import { getDocContent } from "@/lib/docContent";
import { createLocalDoc, listLocalDocs } from "@/lib/localDocs";
import type { TodoItem } from "@/lib/todos/collect";
import { addNoteTask, addTaskToDoc, createDocWithTask, deleteTask, NOTES_TITLE } from "@/lib/todos/write";

const item = (docId: string, line: number, text: string, source: TodoItem["source"] = "doc"): TodoItem => ({
  key: `${docId}:${line}`,
  docId,
  docTitle: "A",
  line,
  text,
  due: null,
  checked: false,
  source,
});

describe("deleteTask", () => {
  it("按行号删掉那一行", async () => {
    const doc = createLocalDoc({ title: "A", content: "# A\n- [ ] 一\n- [ ] 二\n" });
    await deleteTask(item(doc.id, 1, "一"));
    expect(getDocContent(doc.id)).toBe("# A\n- [ ] 二\n");
  });

  it("行号对不上时按文字再找（带日期标签、已勾上的也算）", async () => {
    const doc = createLocalDoc({ title: "A", content: "新插的一行\n# A\n- [ ] 一\n- [x] 二 @明天\n" });
    await deleteTask(item(doc.id, 2, "二"));
    expect(getDocContent(doc.id)).toBe("新插的一行\n# A\n- [ ] 一\n");
  });

  it("找不到、或是发布排期，都不动正文", async () => {
    const md = "---\npublish: 2026-10-12\n---\n- [ ] 一\n";
    const doc = createLocalDoc({ title: "A", content: md });
    await deleteTask(item(doc.id, 3, "没有这条"));
    await deleteTask(item(doc.id, -1, "发布《A》", "publish"));
    expect(getDocContent(doc.id)).toBe(md);
  });
});

describe("追加待办", () => {
  it("addTaskToDoc 追加到指定文章末尾；空文字不动", async () => {
    const doc = createLocalDoc({ title: "A", content: "正文" });
    await addTaskToDoc(doc.id, "补数据 @明天");
    await addTaskToDoc(doc.id, "  ");
    expect(getDocContent(doc.id)).toBe("正文\n- [ ] 补数据 @明天\n");
  });

  it("createDocWithTask 正文就是这一条，返回新 id；空文字不建", async () => {
    const create = vi.fn(async () => "new-id");
    expect(await createDocWithTask("周报", "写\n周报", create)).toBe("new-id");
    expect(create).toHaveBeenCalledWith("周报", "- [ ] 写 周报\n");
    expect(await createDocWithTask("周报", " ", create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("addNoteTask：没有清单就建一篇，有就追加进去", async () => {
    const create = vi.fn(async (title: string, content: string) => createLocalDoc({ title, content }).id);
    await addNoteTask("一", listLocalDocs(), create);
    expect(create).toHaveBeenCalledWith(NOTES_TITLE, "---\ntype: todo\n---\n\n- [ ] 一\n", { log: false });

    await addNoteTask("二", listLocalDocs(), create);
    expect(create).toHaveBeenCalledTimes(1);
    const notes = listLocalDocs().find((d) => d.title === NOTES_TITLE)!;
    expect(getDocContent(notes.id)).toBe("---\ntype: todo\n---\n\n- [ ] 一\n- [ ] 二\n");
  });
});
