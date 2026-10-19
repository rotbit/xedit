// @vitest-environment jsdom
// Video placeholder block: pasting into WeChat strips <video> entirely, leaving only this block to remind the author to add it in the backend.
// Its look relies entirely on inline styles (classes are cleared before copying), so this runs the real
// "render → inline → strip attributes" pipeline and asserts on the style of the final HTML.
// Unit tests default to the node environment without a DOM; this file mounts jsdom on its own: CSSOM must be real, or the inliner can't be verified.

import { describe, expect, it } from "vitest";
import { buildWechatHtml, countVideoPlaceholders, VIDEO_PLACEHOLDER_MARK } from "@/lib/copy/wechat";
import { resolveTheme } from "@/lib/themes";

/** Video syntax reuses images: ![caption](xx.mp4 "poster=coverURL") */
const VIDEO_MD = '![演示](https://example.com/a.mp4 "poster=https://example.com/p.jpg")';

const build = (markdown: string, themeId = "classic") =>
  buildWechatHtml(markdown, { themeCss: resolveTheme(themeId, []).css, codeCss: "" });

/** After inlining, CSSOM normalizes colors to rgb(); either form counts as a match */
const hasColor = (html: string, hex: string, rgb: string) =>
  html.includes(hex) || html.includes(rgb);

describe("公众号视频占位块", () => {
  it("两行提示都在，且警告色是内联上去的", async () => {
    const html = await build(VIDEO_MD);
    expect(html).not.toContain("<video");
    expect(html).toContain(VIDEO_PLACEHOLDER_MARK);
    expect(html).toContain("发表前请在公众号后台点「插入视频」，替换掉这一整块");
    // Amber background + amber dashed border + dark brown text; missing any one and it stops standing out
    expect(hasColor(html, "#fff3cd", "rgb(255, 243, 205)")).toBe(true);
    expect(hasColor(html, "#f0a020", "rgb(240, 160, 32)")).toBe(true);
    expect(hasColor(html, "#8a5300", "rgb(138, 83, 0)")).toBe(true);
    expect(html).toContain("dashed");
    // All classes are cleared, so only inline styles remain
    expect(html).not.toContain("video-placeholder");
    expect(html).not.toContain("video-note");
  });

  it("提示块与封面图都带上琥珀虚线边，连起来是一整块", async () => {
    const html = await build(VIDEO_MD);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const img = doc.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("style")).toMatch(/dashed/);
    // The notice block sits right under the poster image
    expect(img!.nextElementSibling?.tagName.toLowerCase()).toBe("p");
    const note = img!.nextElementSibling as HTMLElement;
    expect(note.style.fontWeight).toBe("bold");
    expect(note.style.fontSize).toBe("15px");
    expect(note.style.textAlign).toBe("center");
    // The second line is the span after <br>, smaller and not bold
    // The bare first-line text gets wrapped in an unstyled span (to dodge WeChat's line-height false positive); find the notice span by its text
    const hint = Array.from(note.querySelectorAll("span")).find((s) =>
      s.textContent?.includes("发表前请在公众号后台")
    );
    expect(hint).toBeDefined();
    expect(hint!.style.fontSize).toBe("13px");
    expect(hint!.style.fontWeight).toBe("normal");
  });

  it("深色主题下仍是警告色，不会退回成灰卡片", async () => {
    const html = await build(VIDEO_MD, "night");
    expect(hasColor(html, "#3a2e12", "rgb(58, 46, 18)")).toBe(true);
    expect(hasColor(html, "#ffd479", "rgb(255, 212, 121)")).toBe(true);
    expect(html).not.toContain("#24283b");
  });

  it("countVideoPlaceholders 数的是成品 HTML 里的占位块", async () => {
    expect(countVideoPlaceholders(await build("# 没有视频"))).toBe(0);
    expect(countVideoPlaceholders(await build(VIDEO_MD))).toBe(1);
    expect(countVideoPlaceholders(await build(`${VIDEO_MD}\n\n${VIDEO_MD}`))).toBe(2);
  });

  it("提示语里不能出现「封面」：发送草稿那边靠这两个字区分封面问题", () => {
    expect(VIDEO_PLACEHOLDER_MARK).not.toContain("封面");
  });
});
