// @vitest-environment jsdom
// 视频占位块：公众号粘贴会整个剥掉 <video>，只剩这一块提醒作者去后台补。
// 它的样子全靠内联样式撑着（class 在复制前会被清掉），所以这里跑的是真实的
// 「渲染 → 内联 → 清属性」全流程，断言落在成品 HTML 的 style 上。
// 单测默认 node 环境没有 DOM，这个文件单独挂 jsdom：CSSOM 得是真的，否则内联器无从验证。

import { describe, expect, it } from "vitest";
import { buildWechatHtml, countVideoPlaceholders, VIDEO_PLACEHOLDER_MARK } from "@/lib/copy/wechat";
import { resolveTheme } from "@/lib/themes";

/** 视频语法复用图片：![说明](xx.mp4 "poster=封面URL") */
const VIDEO_MD = '![演示](https://example.com/a.mp4 "poster=https://example.com/p.jpg")';

const build = (markdown: string, themeId = "classic") =>
  buildWechatHtml(markdown, { themeCss: resolveTheme(themeId, []).css, codeCss: "" });

/** 内联后颜色会被 CSSOM 规范成 rgb()，两种写法都算命中 */
const hasColor = (html: string, hex: string, rgb: string) =>
  html.includes(hex) || html.includes(rgb);

describe("公众号视频占位块", () => {
  it("两行提示都在，且警告色是内联上去的", async () => {
    const html = await build(VIDEO_MD);
    expect(html).not.toContain("<video");
    expect(html).toContain(VIDEO_PLACEHOLDER_MARK);
    expect(html).toContain("发表前请在公众号后台点「插入视频」，替换掉这一整块");
    // 琥珀底 + 琥珀虚线框 + 深棕字，缺一块就不显眼了
    expect(hasColor(html, "#fff3cd", "rgb(255, 243, 205)")).toBe(true);
    expect(hasColor(html, "#f0a020", "rgb(240, 160, 32)")).toBe(true);
    expect(hasColor(html, "#8a5300", "rgb(138, 83, 0)")).toBe(true);
    expect(html).toContain("dashed");
    // class 一律清掉，只能靠内联样式
    expect(html).not.toContain("video-placeholder");
    expect(html).not.toContain("video-note");
  });

  it("提示块与封面图都带上琥珀虚线边，连起来是一整块", async () => {
    const html = await build(VIDEO_MD);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const img = doc.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("style")).toMatch(/dashed/);
    // 提示块紧贴在封面图下面
    expect(img!.nextElementSibling?.tagName.toLowerCase()).toBe("p");
    const note = img!.nextElementSibling as HTMLElement;
    expect(note.style.fontWeight).toBe("bold");
    expect(note.style.fontSize).toBe("15px");
    expect(note.style.textAlign).toBe("center");
    // 第二行是 <br> 后的 span，字号更小、不加粗
    const hint = note.querySelector("span");
    expect(hint).not.toBeNull();
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
