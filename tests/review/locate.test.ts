import { describe, expect, it } from "vitest";

import { layoutCards, locateInSource } from "@/features/review/locate";

/**
 * 审核意见的两块纯逻辑：在源码里找引文、卡片的避让排版。
 *
 * 这两件事决定了「标注画在哪」「卡片站在哪」，出错的样子都是肉眼可见的错位，
 * 但等到肉眼看见时已经很难说清是哪一步歪的，所以在这里钉死。
 */

describe("locateInSource", () => {
  const doc = ["# 标题", "", "第一段说的是甲。", "", "第二段说的也是甲。"].join("\n");

  it("按行号提示找到引文，返回的区间逐字对得上", () => {
    const span = locateInSource(doc, "第二段说的也是甲", 4);
    expect(span).not.toBeNull();
    expect(doc.slice(span!.from, span!.to)).toBe("第二段说的也是甲");
  });

  it("同一段文字出现多次时取离提示行最近的那一处", () => {
    const dup = ["甲乙丙丁", "别的话", "甲乙丙丁", "别的话", "甲乙丙丁"].join("\n");
    const at0 = locateInSource(dup, "甲乙丙丁", 0);
    const at2 = locateInSource(dup, "甲乙丙丁", 2);
    const at4 = locateInSource(dup, "甲乙丙丁", 4);
    expect(at0!.from).toBe(0);
    expect(at2!.from).toBe(dup.indexOf("甲乙丙丁", 1));
    expect(at4!.from).toBe(dup.lastIndexOf("甲乙丙丁"));
  });

  it("提示行早就不存在了也还是能找到（退回全文里最近的一处）", () => {
    const span = locateInSource(doc, "第一段说的是甲", 999);
    expect(span).not.toBeNull();
    expect(doc.slice(span!.from, span!.to)).toBe("第一段说的是甲");
  });

  it("引文已经被改掉 / 引文为空 → null（= 这条意见失效了）", () => {
    expect(locateInSource(doc, "根本没写过这句", 2)).toBeNull();
    expect(locateInSource(doc, "", 2)).toBeNull();
  });
});

describe("layoutCards", () => {
  const H = [40, 40, 40];

  it("彼此够远就各站各的位置", () => {
    expect(layoutCards([0, 100, 300], H, -1, 10)).toEqual([0, 100, 300]);
  });

  it("挤在一起就依次往下让，间距不小于 gap", () => {
    const tops = layoutCards([0, 20, 30], H, -1, 10);
    expect(tops).toEqual([0, 50, 100]);
    expect(tops[1] - (tops[0] + H[0])).toBeGreaterThanOrEqual(10);
  });

  it("选中的那张回到自己的锚点，上面的卡片往上挤给它让位", () => {
    const tops = layoutCards([0, 200, 210], H, 2, 10);
    expect(tops[2]).toBe(210); // 选中的就站在引文那一行
    expect(tops[1]).toBe(160); // 上面那张被挤上去，正好留出 gap
    expect(tops[0]).toBe(0);
  });

  it("上方实在挤不出空间时，选中的那张也只好往下走", () => {
    const tops = layoutCards([0, 20, 30], H, 2, 10);
    expect(tops[0]).toBe(0); // 顶端不会被挤成负数
    expect(tops).toEqual([0, 50, 100]);
  });

  it("空列表 / 越界的 active 不炸", () => {
    expect(layoutCards([], [], 0, 10)).toEqual([]);
    expect(layoutCards([0, 100], [40, 40], 9, 10)).toEqual([0, 100]);
  });
});
