import { describe, expect, it } from "vitest";

import { diffQuote } from "@/features/review/diff";

/**
 * The 「建议改为」 (Suggested change) on the card relies on this small diff for red/green highlighting.
 * It only trims the common prefix and suffix, so two things must hold: reassembling must yield the original / suggestion,
 * and a surrogate pair (emoji) must never be split down the middle — split, it becomes a row of garbled boxes.
 */

/** Reassembly self-check: prefix+removed+suffix = original, prefix+added+suffix = suggestion */
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
    expect(d.prefix).toBe(""); // The high surrogates are the same, but that can't count as a common prefix
    expect(d.removed).toBe("🙂");
    expect(d.added).toBe("🙁");
  });

  it("emoji 在句尾时整个留在后缀里", () => {
    const d = roundTrip("我很好🙂", "我不错🙂");
    expect(d.suffix).toBe("🙂");
    expect(d.removed).toBe("很好");
  });
});
