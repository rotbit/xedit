import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/en";
import { detectLocale, getLocale, htmlLang, isLocale, setLocale } from "@/i18n/locale";
import { interpolate, missingKeys, t, translate } from "@/i18n/t";

describe("interpolate", () => {
  it("替换变量，vars 里没有的占位原样保留（rich() 靠它插节点）", () => {
    expect(interpolate("你好 {name}", { name: "小王" })).toBe("你好 小王");
    expect(interpolate("写了 {doc}", { other: 1 })).toBe("写了 {doc}");
    expect(interpolate("无变量 {x}")).toBe("无变量 {x}");
  });

  it("复数段：1 取第二段，其余取第三段，{count} 本身替成数字", () => {
    const s = "{count} {count, article, articles}";
    expect(interpolate(s, { count: 1 })).toBe("1 article");
    expect(interpolate(s, { count: 0 })).toBe("0 articles");
    expect(interpolate(s, { count: 5 })).toBe("5 articles");
    // 复数段引用的变量缺席时整段保留
    expect(interpolate("{n, a, b}", {})).toBe("{n, a, b}");
  });
});

describe("translate / t", () => {
  afterEach(() => setLocale("zh"));

  it("zh 直接用原文并插值", () => {
    expect(translate("已迁入 {n} 篇文章", "zh", { n: 3 })).toBe("已迁入 3 篇文章");
  });

  it("en 查字典并处理复数", () => {
    expect(translate("今天", "en")).toBe("Today");
    expect(translate("已迁入 {n} 篇文章", "en", { n: 1 })).toBe("Moved 1 article");
    expect(translate("已迁入 {n} 篇文章", "en", { n: 2 })).toBe("Moved 2 articles");
  });

  it("缺词回退中文原文，开发环境同一个 key 只警告一次", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(translate("一句字典里没有的话 {x}", "en", { x: 1 })).toBe("一句字典里没有的话 1");
    translate("一句字典里没有的话 {x}", "en", { x: 2 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(missingKeys()).toContain("一句字典里没有的话 {x}");
  });

  it("原型链上的属性名不会被当成字典命中", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(translate("constructor", "en")).toBe("constructor");
  });

  it("t() 跟随 setLocale", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t("回收站")).toBe("Trash");
    setLocale("zh");
    expect(t("回收站")).toBe("回收站");
  });

  it("字典值里的占位与 key 一致（防止译文漏掉变量）", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(en)) {
      expect(new Set(vars(v)), k).toEqual(new Set(vars(k)));
    }
  });
});

describe("detectLocale", () => {
  it("合法 cookie 优先", () => {
    expect(detectLocale("en", "zh-CN,zh;q=0.9")).toBe("en");
    expect(detectLocale("zh", "en-US")).toBe("zh");
  });

  it("cookie 非法或缺失时看 Accept-Language 第一个语言", () => {
    expect(detectLocale("fr", "en-US,en;q=0.9")).toBe("en");
    expect(detectLocale(undefined, "zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(detectLocale(undefined, "zh-TW")).toBe("zh");
    expect(detectLocale(undefined, "ZH")).toBe("zh");
    expect(detectLocale(undefined, "zh;q=0.8")).toBe("zh");
    expect(detectLocale(undefined, "en-GB,zh-CN;q=0.9")).toBe("en");
    expect(detectLocale(undefined, "ja-JP")).toBe("en");
    // zhuang 之类不是中文：只认 zh 和 zh-*
    expect(detectLocale(undefined, "zha")).toBe("en");
  });

  it("都没有时落回中文", () => {
    expect(detectLocale(undefined, null)).toBe("zh");
    expect(detectLocale(undefined, undefined)).toBe("zh");
    expect(detectLocale(undefined, "")).toBe("zh");
    expect(detectLocale(undefined, "*")).toBe("zh");
  });

  it("isLocale / htmlLang", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("EN")).toBe(false);
    expect(htmlLang("zh")).toBe("zh-CN");
    expect(htmlLang("en")).toBe("en");
  });
});
