import { describe, expect, it } from "vitest";

import { diffQuote } from "@/features/review/diff";

/**
 * 卡片上的「建议改为」靠这个小 diff 标红标绿。
 * 它只掐公共前后缀，所以要守住两件事：拼回去必须还是原文 / 建议，
 * 以及别把一对代理项（emoji）从中间劈开——劈开了就是一串乱码方块。
 */

/** 拼回去的自检：prefix+removed+suffix = 原文，prefix+added+suffix = 建议 */
function roundTrip(before: string, after: string) {
  const d = diffQuote(before, after);
  expect(d.prefix + d.removed + d.suffix).toBe(before);
  expect(d.prefix + d.added + d.suffix).toBe(after);
  return d;
}

describe("diffQuote", () => {
  it("只改中间一段：前后缀不动", () => {
    const d = roundTrip("其实这件事很简单", "这件事其实很简单");
    expect(d.prefix).toBe("");
    expect(d.suffix).toBe("很简单");
  });

  it("纯删除：added 是空串", () => {
    const d = roundTrip("我们其实已经做完了", "我们已经做完了");
    expect(d.removed).toBe("其实");
    expect(d.added).toBe("");
  });

  it("纯插入：removed 是空串", () => {
    const d = roundTrip("我们做完了", "我们已经做完了");
    expect(d.removed).toBe("");
    expect(d.added).toBe("已经");
  });

  it("从头到尾都不一样：整句换掉", () => {
    const d = roundTrip("甲乙丙", "丁戊己");
    expect(d.prefix).toBe("");
    expect(d.suffix).toBe("");
    expect(d.removed).toBe("甲乙丙");
    expect(d.added).toBe("丁戊己");
  });

  it("两句一模一样：没有增删", () => {
    const d = roundTrip("完全一样的一句话", "完全一样的一句话");
    expect(d.removed).toBe("");
    expect(d.added).toBe("");
  });

  it("不把一对代理项从中间劈开（emoji 不会变成乱码）", () => {
    const d = roundTrip("🙂今天不错", "🙁今天不错");
    expect(d.prefix).toBe(""); // 高位代理项相同，但不能算作公共前缀
    expect(d.removed).toBe("🙂");
    expect(d.added).toBe("🙁");
  });

  it("emoji 在句尾时整个留在后缀里", () => {
    const d = roundTrip("我很好🙂", "我不错🙂");
    expect(d.suffix).toBe("🙂");
    expect(d.removed).toBe("很好");
  });
});
