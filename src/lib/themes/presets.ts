// 内置排版主题。每套主题只覆盖颜色与装饰，结构性样式在 base.ts。
// 约定：标题结构为 h2 > span.prefix + span.content + span.suffix

export interface ThemePreset {
  id: string;
  name: string;
  /** 主题代表色，用于选择器里的色块预览 */
  color: string;
  /** 适用的内容类型，展示在主题卡片上 */
  tag: string;
  css: string;
}

const classic: ThemePreset = {
  id: "classic",
  tag: "技术 · 深度长文",
  name: "经典黑",
  color: "#333333",
  css: `
#nice h1 { font-size: 22px; text-align: center; }
#nice h2 { font-size: 20px; border-bottom: 2px solid #333333; }
#nice h2 .content { display: inline-block; padding: 0 2px 4px 2px; }
#nice h3 { font-size: 17px; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #333333; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #333333; }
#nice a { color: #036aca; text-decoration: none; border-bottom: 1px solid #036aca; }
#nice strong { color: #222222; }
#nice em { color: #555555; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #dbdbdb; background-color: #f7f7f7; color: #666666; border-radius: 0 4px 4px 0; }
#nice p code, #nice li code, #nice td code { color: #d14; background-color: #f5f5f5; }
#nice th { background-color: #f5f5f5; }
#nice .footnote-ref { color: #036aca; }
`,
};

const wechatGreen: ThemePreset = {
  id: "wechat-green",
  tag: "职场 · 生活",
  name: "微信绿",
  color: "#07c160",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #07c160; }
#nice h2 { font-size: 18px; text-align: center; }
#nice h2 .content { display: inline-block; background-color: #07c160; color: #ffffff; padding: 4px 18px; border-radius: 4px; font-size: 17px; }
#nice h3 { font-size: 17px; color: #07c160; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #07c160; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #07c160; }
#nice a { color: #07c160; text-decoration: none; border-bottom: 1px solid #07c160; }
#nice strong { color: #07c160; }
#nice em { color: #059948; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #07c160; background-color: #f2fbf6; color: #555555; border-radius: 0 4px 4px 0; }
#nice p code, #nice li code, #nice td code { color: #07c160; background-color: #ebf8f1; }
#nice th { background-color: #eafaf1; }
#nice hr { border-top: 1px solid #b7ebd0; }
#nice .footnote-ref { color: #07c160; }
#nice .table-of-contents { background-color: #f2fbf6; }
`,
};

const techBlue: ThemePreset = {
  id: "tech-blue",
  tag: "技术教程",
  name: "科技蓝",
  color: "#1e6bb8",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #1e6bb8; }
#nice h2 { font-size: 19px; color: #1e6bb8; border-left: 5px solid #1e6bb8; background-color: #f1f7fc; }
#nice h2 .content { display: inline-block; padding: 6px 12px; }
#nice h3 { font-size: 17px; color: #1e6bb8; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #1e6bb8; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #1e6bb8; }
#nice a { color: #1e6bb8; text-decoration: none; border-bottom: 1px solid #1e6bb8; }
#nice strong { color: #1e6bb8; }
#nice em { color: #4a7ca8; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #7fb0dc; background-color: #f1f7fc; color: #555555; border-radius: 0 4px 4px 0; }
#nice p code, #nice li code, #nice td code { color: #1e6bb8; background-color: #ecf3fa; }
#nice th { background-color: #ecf3fa; }
#nice hr { border-top: 1px solid #c4dcf0; }
#nice .footnote-ref { color: #1e6bb8; }
#nice .table-of-contents { background-color: #f1f7fc; }
`,
};

const orangeHeart: ThemePreset = {
  id: "orange-heart",
  tag: "情感 · 生活",
  name: "橙心",
  color: "#ef7060",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #ef7060; }
#nice h2 { font-size: 19px; text-align: center; color: #ef7060; }
#nice h2 .content { display: inline-block; border-bottom: 2px solid #ef7060; padding: 0 6px 4px 6px; }
#nice h3 { font-size: 17px; color: #ef7060; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #ef7060; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #ef7060; }
#nice a { color: #ef7060; text-decoration: none; border-bottom: 1px solid #ef7060; }
#nice strong { color: #ef7060; }
#nice em { color: #d1604f; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #f7b7ae; background-color: #fdf3f2; color: #555555; border-radius: 0 4px 4px 0; }
#nice p code, #nice li code, #nice td code { color: #ef7060; background-color: #fdf0ee; }
#nice th { background-color: #fdf0ee; }
#nice hr { border-top: 1px solid #f7cfc9; }
#nice .footnote-ref { color: #ef7060; }
#nice .table-of-contents { background-color: #fdf3f2; }
`,
};

const violet: ThemePreset = {
  id: "violet",
  tag: "时尚 · 女性",
  name: "蔷薇紫",
  color: "#8e44ad",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #8e44ad; }
#nice h2 { font-size: 18px; text-align: center; }
#nice h2 .content { display: inline-block; color: #ffffff; background-image: linear-gradient(102deg, #9b59b6, #8e44ad); padding: 5px 20px; border-radius: 16px; font-size: 17px; }
#nice h3 { font-size: 17px; color: #8e44ad; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #8e44ad; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #8e44ad; }
#nice a { color: #8e44ad; text-decoration: none; border-bottom: 1px solid #8e44ad; }
#nice strong { color: #8e44ad; }
#nice em { color: #7d5093; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #c39bd3; background-color: #f8f2fb; color: #555555; border-radius: 0 4px 4px 0; }
#nice p code, #nice li code, #nice td code { color: #8e44ad; background-color: #f5eef9; }
#nice th { background-color: #f5eef9; }
#nice hr { border-top: 1px solid #ddc3e8; }
#nice .footnote-ref { color: #8e44ad; }
#nice .table-of-contents { background-color: #f8f2fb; }
`,
};

const ink: ThemePreset = {
  id: "ink",
  tag: "文化 · 散文",
  name: "水墨",
  color: "#576b95",
  css: `
#nice { font-family: Optima, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif; }
#nice h1 { font-size: 21px; text-align: center; letter-spacing: 0.15em; }
#nice h2 { font-size: 18px; text-align: center; color: #40464f; letter-spacing: 0.15em; }
#nice h2 .prefix { display: inline-block; width: 22px; height: 1px; background-color: #40464f; vertical-align: middle; margin-right: 12px; }
#nice h2 .suffix { display: inline-block; width: 22px; height: 1px; background-color: #40464f; vertical-align: middle; margin-left: 12px; }
#nice h3 { font-size: 16px; color: #40464f; letter-spacing: 0.1em; }
#nice h3 .prefix { display: inline-block; width: 3px; height: 14px; background-color: #576b95; margin-right: 8px; }
#nice h4 { font-size: 16px; color: #40464f; }
#nice p { color: #40464f; }
#nice a { color: #576b95; text-decoration: none; border-bottom: 1px dashed #576b95; }
#nice strong { color: #1a1a1a; }
#nice em { color: #576b95; font-style: normal; letter-spacing: 0.05em; }
#nice del { color: #999999; }
#nice blockquote { border-left: 2px solid #aeb6c5; background-color: #f7f8fa; color: #6b7386; border-radius: 0; font-size: 15px; }
#nice p code, #nice li code, #nice td code { color: #576b95; background-color: #f2f4f8; }
#nice th { background-color: #f4f5f7; }
#nice hr { border-top: 1px dashed #c2c8d5; }
#nice figcaption { letter-spacing: 0.05em; }
#nice .footnote-ref { color: #576b95; }
#nice .table-of-contents { background-color: #f7f8fa; }
`,
};

const chineseRed: ThemePreset = {
  id: "chinese-red",
  tag: "品牌 · 活动",
  name: "绛红",
  color: "#c0392b",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #c0392b; }
#nice h2 { font-size: 18px; }
#nice h2 .content { display: inline-block; background-color: #c0392b; color: #ffffff; padding: 5px 16px 5px 14px; border-radius: 0 15px 15px 0; font-size: 17px; margin-left: -16px; padding-left: 20px; }
#nice h3 { font-size: 17px; color: #c0392b; }
#nice h3 .prefix { display: inline-block; width: 12px; height: 12px; border: 3px solid #c0392b; border-radius: 50%; margin-right: 8px; }
#nice h4 { font-size: 16px; color: #c0392b; }
#nice a { color: #c0392b; text-decoration: none; border-bottom: 1px solid #c0392b; }
#nice strong { color: #c0392b; }
#nice em { color: #a53125; }
#nice del { color: #999999; }
#nice blockquote { border-left: 4px solid #c0392b; background-color: #fbf0ee; color: #74544f; border-radius: 0 6px 6px 0; }
#nice p code, #nice li code, #nice td code { color: #c0392b; background-color: #faeae7; }
#nice th { background-color: #fbf0ee; color: #a53125; }
#nice hr { border-top: 2px solid #e8c6c0; }
#nice .footnote-ref { color: #c0392b; }
#nice .table-of-contents { background-color: #fbf0ee; }
`,
};

const bambooTeal: ThemePreset = {
  id: "bamboo",
  tag: "国风 · 读书",
  name: "青竹",
  color: "#0e9285",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #0e9285; letter-spacing: 0.1em; }
#nice h2 { font-size: 18px; text-align: center; color: #0e9285; }
#nice h2 .content { display: inline-block; border-top: 1px solid #0e9285; border-bottom: 1px solid #0e9285; padding: 6px 14px; letter-spacing: 0.15em; }
#nice h3 { font-size: 17px; color: #0e9285; }
#nice h3 .prefix { display: inline-block; width: 5px; height: 5px; background-color: #0e9285; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
#nice h3 .suffix { display: inline-block; width: 24px; height: 2px; background-color: #b5e0db; margin-left: 10px; vertical-align: middle; }
#nice h4 { font-size: 16px; color: #0e9285; }
#nice a { color: #0e9285; text-decoration: none; border-bottom: 1px solid #0e9285; }
#nice strong { color: #0e9285; }
#nice em { color: #0b7268; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #7ccec5; background-color: #eef8f6; color: #4f6f6b; border-radius: 0 4px 4px 0; }
#nice p code, #nice li code, #nice td code { color: #0b7268; background-color: #e7f5f3; }
#nice th { background-color: #e7f5f3; }
#nice hr { border-top: 1px solid #a9dcd6; }
#nice .footnote-ref { color: #0e9285; }
#nice .table-of-contents { background-color: #eef8f6; }
`,
};

const magazine: ThemePreset = {
  id: "magazine",
  tag: "深度 · 评论",
  name: "杂志风",
  color: "#1a1a1a",
  css: `
#nice { font-family: Optima, Georgia, "Songti SC", "Noto Serif SC", serif; color: #2b2b2b; }
#nice p { line-height: 1.9; }
#nice h1 { font-size: 24px; text-align: center; letter-spacing: 0.05em; }
#nice h1 .content { display: inline-block; border-bottom: 3px double #1a1a1a; padding-bottom: 8px; }
#nice h2 { font-size: 20px; letter-spacing: 0.05em; }
#nice h2 .prefix { display: inline-block; width: 28px; height: 3px; background-color: #1a1a1a; vertical-align: middle; margin-right: 12px; }
#nice h3 { font-size: 17px; }
#nice h3 .content { display: inline-block; border-bottom: 1px solid #1a1a1a; padding-bottom: 3px; }
#nice h4 { font-size: 16px; }
#nice a { color: #1a1a1a; text-decoration: none; border-bottom: 2px solid #d8c9a3; }
#nice strong { color: #1a1a1a; background-image: linear-gradient(transparent 60%, #efe3c4 60%); }
#nice em { color: #6b5d3f; }
#nice del { color: #999999; }
#nice blockquote { border-left: none; background-color: transparent; text-align: center; color: #6b6b6b; font-size: 17px; padding: 8px 24px; }
#nice blockquote p { line-height: 1.8; }
#nice p code, #nice li code, #nice td code { color: #8a6d1d; background-color: #f7f2e4; }
#nice th { background-color: #f5f1e6; }
#nice hr { border-top: 3px double #cccccc; }
#nice figcaption { font-style: italic; }
#nice .footnote-ref { color: #8a6d1d; }
#nice .table-of-contents { background-color: #faf7ef; }
`,
};

const nightIndigo: ThemePreset = {
  id: "night",
  tag: "程序员 · 夜读",
  name: "靛夜",
  color: "#1a1b26",
  css: `
#nice { background-color: #1a1b26; color: #c6cade; }
#nice p { color: #c6cade; }
#nice h1 { font-size: 22px; text-align: center; color: #7aa2f7; }
#nice h2 { font-size: 18px; color: #7aa2f7; }
#nice h2 .content { display: inline-block; border-bottom: 2px solid #7aa2f7; padding: 0 4px 5px 2px; }
#nice h3 { font-size: 17px; color: #bb9af7; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #bb9af7; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #7dcfff; }
#nice a { color: #7aa2f7; text-decoration: none; border-bottom: 1px solid #7aa2f7; }
#nice strong { color: #ff9e64; }
#nice em { color: #bb9af7; }
#nice del { color: #565f89; }
#nice blockquote { border-left: 3px solid #414868; background-color: #24283b; color: #9aa5ce; border-radius: 0 4px 4px 0; }
#nice p code, #nice li code, #nice td code { color: #7dcfff; background-color: #24283b; }
#nice th { background-color: #24283b; color: #7aa2f7; }
#nice th, #nice td { border-color: #414868; }
#nice hr { border-top: 1px solid #414868; }
#nice figcaption { color: #565f89; }
#nice .footnote-ref { color: #7aa2f7; }
#nice .footnote-item { color: #565f89; }
#nice .table-of-contents { background-color: #24283b; }
#nice .math svg { color: #c6cade; }
`,
};

const sakura: ThemePreset = {
  id: "sakura",
  tag: "女性 · 生活",
  name: "樱粉",
  color: "#e8618c",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #e8618c; }
#nice h2 { font-size: 18px; text-align: center; }
#nice h2 .content { display: inline-block; color: #ffffff; background-image: linear-gradient(102deg, #f08bab, #e8618c); padding: 5px 22px; border-radius: 20px; font-size: 17px; }
#nice h3 { font-size: 17px; color: #e8618c; }
#nice h3 .prefix { display: inline-block; width: 10px; height: 10px; background-image: linear-gradient(135deg, #f6b6ca, #e8618c); border-radius: 50% 50% 50% 0; margin-right: 8px; }
#nice h4 { font-size: 16px; color: #e8618c; }
#nice a { color: #e8618c; text-decoration: none; border-bottom: 1px solid #f0a1bb; }
#nice strong { color: #e8618c; }
#nice em { color: #c94f76; }
#nice del { color: #b3b3b3; }
#nice blockquote { border-left: 3px solid #f3b9cc; background-color: #fdf2f6; color: #8a6470; border-radius: 0 10px 10px 0; }
#nice p code, #nice li code, #nice td code { color: #d8577f; background-color: #fceef3; }
#nice th { background-color: #fceef3; color: #c94f76; }
#nice th, #nice td { border-color: #f3d4df; }
#nice hr { border-top: 1px dashed #f0a1bb; }
#nice figcaption { color: #c99aa9; }
#nice .footnote-ref { color: #e8618c; }
#nice .table-of-contents { background-color: #fdf2f6; }
`,
};

const minimalGray: ThemePreset = {
  id: "minimal",
  tag: "万字长文",
  name: "极简",
  color: "#8c8c8c",
  css: `
#nice { color: #404040; letter-spacing: 0.05em; }
#nice p { line-height: 1.9; color: #404040; }
#nice h1 { font-size: 20px; font-weight: 600; }
#nice h2 { font-size: 18px; font-weight: 600; color: #1f1f1f; }
#nice h3 { font-size: 16px; font-weight: 600; color: #1f1f1f; }
#nice h4 { font-size: 15px; font-weight: 600; color: #404040; }
#nice a { color: #1f1f1f; text-decoration: none; border-bottom: 1px solid #bfbfbf; }
#nice strong { color: #000000; font-weight: 600; }
#nice em { color: #595959; }
#nice del { color: #a6a6a6; }
#nice blockquote { border-left: 2px solid #d9d9d9; background-color: transparent; color: #8c8c8c; padding: 1px 18px; }
#nice p code, #nice li code, #nice td code { color: #595959; background-color: #f5f5f5; }
#nice th { background-color: #fafafa; }
#nice th, #nice td { border-color: #e8e8e8; }
#nice hr { border-top: 1px solid #e8e8e8; margin: 36px 0; }
#nice figcaption { color: #a6a6a6; }
#nice .footnote-ref { color: #595959; }
#nice .table-of-contents { background-color: #fafafa; }
`,
};

const lanying: ThemePreset = {
  id: "lanying",
  name: "蓝莹",
  color: "#3aa1f0",
  tag: "技术 · 科普",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #1787e0; }
#nice h2 { font-size: 18px; text-align: center; }
#nice h2 .content { display: inline-block; color: #ffffff; background-image: linear-gradient(102deg, #4aa8f5, #1787e0); padding: 5px 20px; border-radius: 6px; font-size: 17px; }
#nice h3 { font-size: 17px; color: #1787e0; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-image: linear-gradient(180deg, #4aa8f5, #1787e0); margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #1787e0; }
#nice a { color: #1787e0; text-decoration: none; border-bottom: 1px solid #7cc0f4; }
#nice strong { color: #1787e0; }
#nice em { color: #3a7bb8; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #7cc0f4; background-color: #f2f9ff; color: #4f6b83; border-radius: 6px; }
#nice p code, #nice li code, #nice td code { color: #1787e0; background-color: #ecf5fd; }
#nice th { background-color: #ecf5fd; color: #1470ba; }
#nice th, #nice td { border-color: #cfe6f8; }
#nice hr { border-top: 1px solid #b3d9f5; }
#nice figcaption { color: #8fb4d1; }
#nice .footnote-ref { color: #1787e0; }
#nice .table-of-contents { background-color: #f2f9ff; }
`,
};

export const THEME_PRESETS: ThemePreset[] = [
  classic,
  wechatGreen,
  techBlue,
  lanying,
  orangeHeart,
  violet,
  ink,
  chineseRed,
  bambooTeal,
  magazine,
  nightIndigo,
  sakura,
  minimalGray,
];
