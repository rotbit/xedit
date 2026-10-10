/**
 * 待办写回：走真实的本地文档存储（未登录 / 本地模式那条路），
 * 编辑器没挂着任何一篇，所以读写都直接落存储。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocContent } from "@/lib/docContent";
import { createLocalDoc, listLocalDocs } from "@/lib/localDocs";
import type { TodoItem } from "@/lib/todos/collect";
import {
  addNoteTask,
  addTaskToDoc,
  deleteTask,
  NOTES_TITLE,
  setTaskChecked,
  setTaskDue,
  setTaskLink,
  setTaskRepeat,
} from "@/lib/todos/write";

const item = (docId: string, line: number, text: string, source: TodoItem["source"] = "doc"): TodoItem => ({
  key: `${docId}:${line}`,
  docId,
  docTitle: "A",
  line,
  text,
  due: null,
  end: null,
  checked: false,
  repeat: null,
  source,
  link: null,
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

describe("setTaskDue", () => {
  it("改正文行尾日期，去掉日期；发布排期改 frontmatter、不给去掉", async () => {
    const doc = createLocalDoc({ title: "A", content: "# A\n- [ ] 一 @明天\n" });
    await setTaskDue(item(doc.id, 1, "一"), { due: "2026-10-20", end: null });
    expect(getDocContent(doc.id)).toBe("# A\n- [ ] 一 @2026-10-20\n");
    await setTaskDue(item(doc.id, 1, "一"), null);
    expect(getDocContent(doc.id)).toBe("# A\n- [ ] 一\n");

    const pub = createLocalDoc({ title: "B", content: "---\npublish: 2026-10-12\n---\n正文" });
    await setTaskDue(item(pub.id, -1, "发布《B》", "publish"), { due: "2026-10-15", end: null });
    expect(getDocContent(pub.id)).toBe("---\npublish: 2026-10-15\n---\n正文");
    await setTaskDue(item(pub.id, -1, "发布《B》", "publish"), null);
    expect(getDocContent(pub.id)).toBe("---\npublish: 2026-10-15\n---\n正文");
  });
});

describe("setTaskLink", () => {
  it("清单行加 / 换 / 去关联，行号对不上也按去掉标记的文字找到", async () => {
    const doc = createLocalDoc({ title: "清单", content: "---\ntype: todo\n---\n- [ ] 补数据 @2026-10-20\n" });
    await setTaskLink(item(doc.id, 3, "补数据", "notes"), "x1");
    expect(getDocContent(doc.id)).toBe("---\ntype: todo\n---\n- [ ] 补数据 [[x1]] @2026-10-20\n");
    await setTaskLink(item(doc.id, 9, "补数据", "notes"), "x2");
    expect(getDocContent(doc.id)).toBe("---\ntype: todo\n---\n- [ ] 补数据 [[x2]] @2026-10-20\n");
    await setTaskLink(item(doc.id, 3, "补数据", "notes"), null);
    expect(getDocContent(doc.id)).toBe("---\ntype: todo\n---\n- [ ] 补数据 @2026-10-20\n");
  });
});

describe("每日任务写回", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("勾选找得到昨天留着 [x] 的那条；勾上写今天，取消去日期；设 / 取消重复", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 10, 9));
    const doc = createLocalDoc({ title: "A", content: "新插的一行\n# A\n- [x] 跑步 @每天:2026-10-09\n" });
    // 行号对不上、原始框又是 [x]：照样认出这是今天还没做的那条
    await setTaskChecked(item(doc.id, 1, "跑步"), true);
    expect(getDocContent(doc.id)).toBe("新插的一行\n# A\n- [x] 跑步 @每天:2026-10-10\n");
    await setTaskChecked({ ...item(doc.id, 2, "跑步"), checked: true, repeat: "daily" }, false);
    expect(getDocContent(doc.id)).toBe("新插的一行\n# A\n- [ ] 跑步 @每天\n");

    await setTaskRepeat(item(doc.id, 2, "跑步"), false);
    expect(getDocContent(doc.id)).toBe("新插的一行\n# A\n- [ ] 跑步 @2026-10-10\n");
    await setTaskRepeat(item(doc.id, 2, "跑步"), true);
    expect(getDocContent(doc.id)).toBe("新插的一行\n# A\n- [ ] 跑步 @每天\n");
  });
});
