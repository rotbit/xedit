import { describe, expect, it, vi } from "vitest";
import {
  RECENT_OPENS_EVENT,
  markOpened,
  pruneOpens,
  readOpens,
  recencyOf,
} from "@/features/workspace/lib/recentOpens";
import type { DocMeta } from "@/features/workspace/types";

const KEY = "xedit.recentOpens";

describe("recentOpens", () => {
  it("markOpened 写入并派发事件", () => {
    const spy = vi.fn();
    window.addEventListener(RECENT_OPENS_EVENT, spy);
    markOpened("a", 1000);
    markOpened("b", 2000);
    window.removeEventListener(RECENT_OPENS_EVENT, spy);
    expect(readOpens()).toEqual({ a: 1000, b: 2000 });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ a: 1000, b: 2000 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("超过 300 条只保留最新 300 条", () => {
    for (let i = 0; i < 301; i++) markOpened(`d${i}`, 1000 + i);
    const opens = readOpens();
    expect(Object.keys(opens)).toHaveLength(300);
    expect(opens.d0).toBeUndefined();
    expect(opens.d300).toBe(1300);
  });

  it("坏数据回退为空对象", () => {
    for (const raw of ["{not json", "[1,2]", "null", "42"]) {
      localStorage.setItem(KEY, raw);
      expect(readOpens()).toEqual({});
    }
    localStorage.setItem(KEY, JSON.stringify({ a: 1, b: "x" }));
    expect(readOpens()).toEqual({ a: 1 });
  });

  it("内容不变时返回同一引用，markOpened 后换新引用", () => {
    markOpened("a", 1);
    const first = readOpens();
    expect(readOpens()).toBe(first);
    markOpened("b", 2);
    const second = readOpens();
    expect(second).not.toBe(first);
    expect(readOpens()).toBe(second);
  });

  it("pruneOpens 删掉不在库里的 id，没变化不写", () => {
    markOpened("a", 1);
    markOpened("b", 2);
    const spy = vi.fn();
    window.addEventListener(RECENT_OPENS_EVENT, spy);
    pruneOpens(["a", "b", "c"]);
    expect(spy).not.toHaveBeenCalled();
    pruneOpens(new Set(["b"]));
    window.removeEventListener(RECENT_OPENS_EVENT, spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(readOpens()).toEqual({ b: 2 });
  });

  describe("recencyOf", () => {
    const doc = (updatedAt: string): DocMeta => ({ id: "x", title: "x", updatedAt });
    const t1 = Date.UTC(2026, 9, 1);
    const t2 = Date.UTC(2026, 9, 5);

    it("打开晚于编辑取打开时间，反之取编辑时间", () => {
      expect(recencyOf(doc(new Date(t1).toISOString()), { x: t2 })).toBe(new Date(t2).toISOString());
      expect(recencyOf(doc(new Date(t2).toISOString()), { x: t1 })).toBe(new Date(t2).toISOString());
      expect(recencyOf(doc(new Date(t1).toISOString()), {})).toBe(new Date(t1).toISOString());
    });

    it("updatedAt 解析失败按 0，仍取打开时间", () => {
      expect(recencyOf(doc("not-a-date"), { x: t1 })).toBe(new Date(t1).toISOString());
    });

    it("两者都没有时原样返回 updatedAt", () => {
      expect(recencyOf(doc("not-a-date"), {})).toBe("not-a-date");
    });
  });
});
