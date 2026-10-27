import { describe, expect, it } from "vitest";
import type { DocMeta } from "@/features/workspace/types";
import { DAILY_CATEGORY, findDailyNote, findDailyTemplate } from "@/lib/dailyNote";

const doc = (id: string, title: string, category?: string): DocMeta => ({
  id,
  title,
  category,
  updatedAt: "2026-10-21T00:00:00.000Z",
});

describe("findDailyNote", () => {
  it("prefers the note in the daily category", () => {
    const docs = [doc("a", "2026-10-21", "未分类"), doc("b", "2026-10-21", DAILY_CATEGORY)];
    expect(findDailyNote(docs, "2026-10-21")?.id).toBe("b");
  });

  it("still finds a note the user moved to another folder", () => {
    expect(findDailyNote([doc("a", " 2026-10-21 ", "工作")], "2026-10-21")?.id).toBe("a");
  });

  it("ignores templates and other days", () => {
    const docs = [doc("t", "2026-10-21", "模板"), doc("y", "2026-10-20", DAILY_CATEGORY)];
    expect(findDailyNote(docs, "2026-10-21")).toBeNull();
    expect(findDailyNote(null, "2026-10-21")).toBeNull();
  });
});

describe("findDailyTemplate", () => {
  it("matches daily template titles in the template folder", () => {
    expect(findDailyTemplate([doc("x", "周报模板", "模板"), doc("d", "日记模板", "模板")])?.id).toBe("d");
    expect(findDailyTemplate([doc("e", "Daily Note", "模板/日常")])?.id).toBe("e");
  });

  it("ignores docs outside the template folder", () => {
    expect(findDailyTemplate([doc("d", "日记", DAILY_CATEGORY)])).toBeNull();
  });
});
