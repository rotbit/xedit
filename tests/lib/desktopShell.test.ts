// 桌面壳探测：「发送到公众号」这类只在 xEdit 桌面版里成立的入口全靠它判断，
// 判错了要么纯浏览器里冒出个 Chrome 窗口，要么桌面版里找不到功能。

import { afterEach, describe, expect, it } from "vitest";
import { desktopShell, isDesktopShell } from "@/lib/desktopShell";

const g = globalThis as unknown as { xeditDesktop?: unknown };

afterEach(() => {
  delete g.xeditDesktop;
});

describe("isDesktopShell", () => {
  it("普通浏览器里没有 window.xeditDesktop，判为非桌面", () => {
    expect(isDesktopShell()).toBe(false);
    expect(desktopShell()).toBeNull();
  });

  it("preload 挂上对象就算桌面壳，哪怕字段都是空的", () => {
    g.xeditDesktop = {};
    expect(isDesktopShell()).toBe(true);
  });

  it("桌面壳的字段原样读出来（进度胶囊靠 draftProgress 决定网页要不要弹提示）", () => {
    g.xeditDesktop = { platform: "darwin", draftProgress: true };
    expect(desktopShell()?.platform).toBe("darwin");
    expect(desktopShell()?.draftProgress).toBe(true);
  });
});
