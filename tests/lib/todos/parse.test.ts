import { describe, expect, it } from "vitest";
import {
  appendTask,
  isNotesDoc,
  markPublished,
  parsePublish,
  parseTasks,
  removeTaskLine,
  setPublishDate,
  setTaskLineDue,
  toggleTaskLine,
} from "@/lib/todos/parse";

const T = "2026-10-08";

describe("parseTasks", () => {
  it("跳过 frontmatter 与围栏代码块，行号按全文计", () => {
    const md = [
      "---",
      "title: a",
      "---",
      "- [ ] 第一件 @明天",
      "```md",
      "- [ ] 代码里的",
      "```",
      "~~~~",
      "- [x] 也是代码",
      "~~~",
      "- [x] 仍在代码里",
      "~~~~",
      "  * [X] 第二件",
      "+ [ ]   ",
      "- [] 不是任务",
    ].join("\n");
    expect(parseTasks(md, T)).toEqual([
      { line: 3, checked: false, text: "第一件", due: "2026-10-09" },
      { line: 12, checked: true, text: "第二件", due: null },
    ]);
  });

  it("\\r\\n 换行同样能认", () => {
    expect(parseTasks("a\r\n- [ ] 事\r\n", T)).toEqual([{ line: 1, checked: false, text: "事", due: null }]);
  });
});

describe("frontmatter 读取", () => {
  it("publish / 发布 / published", () => {
    expect(parsePublish("---\npublish: 2026-10-12\n---\n")).toEqual({ due: "2026-10-12", published: false });
    expect(parsePublish("---\n发布: 2026/1/2\npublished: true\n---\n")).toEqual({ due: "2026-01-02", published: true });
    expect(parsePublish("正文")).toEqual({ due: null, published: false });
    expect(parsePublish("---\npublish: 下周\n---\n").due).toBeNull();
  });

  it("isNotesDoc", () => {
    expect(isNotesDoc("---\ntype: todo\n---\n\n- [ ] a\n")).toBe(true);
    expect(isNotesDoc("---\ntype: post\n---\n")).toBe(false);
    expect(isNotesDoc("type: todo")).toBe(false);
  });
});

describe("改写", () => {
  it("toggleTaskLine 只改那一行，保留 \\r\\n 与其他字节", () => {
    const md = "# 标题\r\n- [ ] a  \r\n- [ ] b\r\n";
    expect(toggleTaskLine(md, 1, true)).toBe("# 标题\r\n- [x] a  \r\n- [ ] b\r\n");
    expect(toggleTaskLine("- [X] a", 0, false)).toBe("- [ ] a");
    expect(toggleTaskLine(md, 0, true)).toBe(md);
    expect(toggleTaskLine(md, 99, true)).toBe(md);
  });

  it("appendTask 处理末尾有无换行与空文", () => {
    expect(appendTask("", "a")).toBe("- [ ] a\n");
    expect(appendTask("- [ ] a\n", "b")).toBe("- [ ] a\n- [ ] b\n");
    expect(appendTask("- [ ] a", "b")).toBe("- [ ] a\n- [ ] b\n");
    expect(appendTask("x\r\n", "b")).toBe("x\r\n- [ ] b\r\n");
    expect(appendTask("x\n", "  ")).toBe("x\n");
  });

  it("removeTaskLine 连同换行删掉那一行，保留 \\r\\n；不是任务行不动", () => {
    expect(removeTaskLine("a\n- [ ] b\nc\n", 1)).toBe("a\nc\n");
    expect(removeTaskLine("a\r\n- [x] b\r\nc\r\n", 1)).toBe("a\r\nc\r\n");
    expect(removeTaskLine("a\n- [ ] b\n", 1)).toBe("a\n");
    expect(removeTaskLine("a\n- [ ] b", 1)).toBe("a");
    expect(removeTaskLine("- [ ] b", 0)).toBe("");
    expect(removeTaskLine("a\n- [ ] b\n", 0)).toBe("a\n- [ ] b\n");
    expect(removeTaskLine("a\n", 9)).toBe("a\n");
  });

  it("markPublished 插到收尾 --- 之前；没有 frontmatter 不动", () => {
    expect(markPublished("---\npublish: 2026-10-12\n---\n正文")).toBe(
      "---\npublish: 2026-10-12\npublished: true\n---\n正文"
    );
    expect(markPublished("---\r\npublish: 2026-10-12\r\n---\r\n正文")).toBe(
      "---\r\npublish: 2026-10-12\r\npublished: true\r\n---\r\n正文"
    );
    expect(markPublished("---\npublish: 2026-10-12\n---")).toBe("---\npublish: 2026-10-12\npublished: true\n---");
    expect(parsePublish(markPublished("---\npublished: false\n---\n")).published).toBe(true);
    expect(markPublished("正文")).toBe("正文");
  });
});

describe("改日期", () => {
  it("setTaskLineDue 把已有的相对标签换成绝对日期", () => {
    expect(setTaskLineDue("# A\n- [ ] 写稿 @明天\n", 1, "2026-10-12", T)).toBe("# A\n- [ ] 写稿 @2026-10-12\n");
    expect(setTaskLineDue("  * [x] 写稿 @10/9", 0, "2026-10-12", T)).toBe("  * [x] 写稿 @2026-10-12");
    expect(setTaskLineDue("- [ ] 写稿", 0, "2026-10-12", T)).toBe("- [ ] 写稿 @2026-10-12");
  });

  it("setTaskLineDue 不认识的 @xxx 保留并追加日期", () => {
    expect(setTaskLineDue("- [ ] 问 @老王", 0, "2026-10-12", T)).toBe("- [ ] 问 @老王 @2026-10-12");
    expect(parseTasks(setTaskLineDue("- [ ] 问 @老王", 0, "2026-10-12", T), T)[0]).toMatchObject({
      text: "问 @老王",
      due: "2026-10-12",
    });
  });

  it("setTaskLineDue 传 null 去掉日期；不是任务行不动", () => {
    expect(setTaskLineDue("- [ ] 写稿 @2026-10-12", 0, null, T)).toBe("- [ ] 写稿");
    expect(setTaskLineDue("- [ ] 写稿", 0, null, T)).toBe("- [ ] 写稿");
    expect(setTaskLineDue("正文 @明天", 0, "2026-10-12", T)).toBe("正文 @明天");
    expect(setTaskLineDue("a", 5, "2026-10-12", T)).toBe("a");
  });

  it("setTaskLineDue 保留 \\r\\n，只动那一行", () => {
    const md = "# A\r\n- [ ] 写稿 @明天\r\n- [ ] 别动 @明天\r\n";
    expect(setTaskLineDue(md, 1, "2026-10-12", T)).toBe("# A\r\n- [ ] 写稿 @2026-10-12\r\n- [ ] 别动 @明天\r\n");
    expect(setTaskLineDue(md, 1, null, T)).toBe("# A\r\n- [ ] 写稿\r\n- [ ] 别动 @明天\r\n");
  });

  it("setPublishDate 只改 publish 那一行的值", () => {
    expect(setPublishDate("---\ntitle: a\npublish: 2026-10-12\n---\n正文", "2026-10-15")).toBe(
      "---\ntitle: a\npublish: 2026-10-15\n---\n正文"
    );
    expect(setPublishDate("---\r\n发布:  2026/10/12\r\n---\r\n", "2026-10-15")).toBe("---\r\n发布:  2026-10-15\r\n---\r\n");
    expect(setPublishDate('---\npublish: "2026-10-12"\n---\n', "2026-10-15")).toBe('---\npublish: "2026-10-15"\n---\n');
    expect(setPublishDate("---\ntitle: a\n---\npublish: 2026-10-12\n", "2026-10-15")).toBe(
      "---\ntitle: a\n---\npublish: 2026-10-12\n"
    );
    expect(setPublishDate("正文", "2026-10-15")).toBe("正文");
  });
});
