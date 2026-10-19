// Desktop shell detection: entries like 「发送到公众号」 (Send to WeChat) that only work in the xEdit desktop app depend on it;
// get it wrong and either a Chrome window pops up in a plain browser, or the desktop app can't find the feature.

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
