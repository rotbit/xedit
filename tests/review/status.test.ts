import { describe, expect, it } from "vitest";

import { deriveStatus, isHandled, isOpen } from "@/features/review/status";
import type { ReviewItem } from "@/features/review/types";

/**
 * 状态是从正文现推的，不另存一份。这一组用例就是在钉这个性质：
 * 同一条意见，喂不同的正文进去，得到的状态必须跟着正文走——
 * 于是作者 ⌘Z 撤销掉一次采纳，卡片会自己活过来。
 */

const item: ReviewItem = {
  id: "rv1",
  category: "verbose",
  quote: "其实这件事很简单",
  line: 2,
  problem: "「其实」可以删",
  suggestion: "这件事很简单",
};

const source = (body: string) => ["# 标题", "", body].join("\n");

describe("deriveStatus", () => {
  it("引文还在 → 待处理", () => {
    expect(deriveStatus(item, source("其实这件事很简单。"))).toBe("open");
  });

  it("按过「忽略」→ 忽略（正文里还在也不管）", () => {
    expect(deriveStatus(item, source("其实这件事很简单。"), "ignored")).toBe("ignored");
  });

  it("按过「知道了」→ 已知道", () => {
    expect(deriveStatus(item, source("其实这件事很简单。"), "acked")).toBe("acked");
  });

  it("引文没了、建议在原处 → 已采纳（不必另记一笔）", () => {
    expect(deriveStatus(item, source("这件事很简单。"))).toBe("accepted");
  });

  it("采纳之后撤销回去，状态自己退回待处理", () => {
    const accepted = source("这件事很简单。");
    const undone = source("其实这件事很简单。");
    expect(deriveStatus(item, accepted)).toBe("accepted");
    expect(deriveStatus(item, undone)).toBe("open");
  });

  it("作者自己把这句改了 → 失效", () => {
    expect(deriveStatus(item, source("这事儿不难。"))).toBe("stale");
  });

  it("本来就没有建议可采纳的那种，引文一没就是失效", () => {
    const noFix: ReviewItem = { ...item, suggestion: undefined };
    expect(deriveStatus(noFix, source("这件事很简单。"))).toBe("stale");
  });
});

describe("isOpen / isHandled", () => {
  it("只有 open 算待处理", () => {
    expect(isOpen("open")).toBe(true);
    expect(isOpen("stale")).toBe(false);
    expect(isOpen("accepted")).toBe(false);
  });

  it("采纳 / 知道了 / 忽略算已处理，失效不算（作者没表过态）", () => {
    expect(isHandled("accepted")).toBe(true);
    expect(isHandled("acked")).toBe(true);
    expect(isHandled("ignored")).toBe(true);
    expect(isHandled("stale")).toBe(false);
    expect(isHandled("open")).toBe(false);
  });
});
