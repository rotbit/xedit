// 内置排版主题。每套主题只覆盖颜色与装饰，结构性样式在 base.ts。
// 约定：标题结构为 h2 > span.prefix + span.content + span.suffix
// 配色思路：强调色只出现在标题/链接/行内代码等少数位置，大面积块（引用、表格、目录）
// 一律用低饱和浅底，避免「满屏主题色」的廉价感；深浅两档主色拉开层次。

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
#nice { color: #2b2b2b; }
#nice h1 { font-size: 22px; text-align: center; color: #1a1a1a; }
#nice h2 { font-size: 20px; color: #1a1a1a; }
#nice h2 .content { display: inline-block; border-bottom: 3px solid #2b2b2b; padding: 0 2px 6px 2px; }
#nice h3 { font-size: 17px; color: #1a1a1a; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-color: #2b2b2b; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #1a1a1a; }
#nice a { color: #0969da; text-decoration: none; border-bottom: 1px solid #9cc7f0; }
#nice strong { color: #111111; }
#nice em { color: #555555; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #d9d9d9; background-color: #f7f7f7; color: #595959; border-radius: 0 6px 6px 0; }
#nice p code, #nice li code, #nice td code { color: #d02f55; background-color: #f7f2f4; }
#nice th { background-color: #f2f2f2; }
#nice .footnote-ref { color: #0969da; }
#nice figcaption { color: #a3a3a3; }
`,
};

const wechatGreen: ThemePreset = {
  id: "wechat-green",
  tag: "职场 · 生活",
  name: "微信绿",
  color: "#07c160",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #059048; }
#nice h2 { font-size: 18px; text-align: center; }
#nice h2 .content { display: inline-block; background-color: #07c160; color: #ffffff; padding: 5px 18px; border-radius: 6px; font-size: 17px; letter-spacing: 1px; box-shadow: 0 3px 8px rgba(7, 193, 96, 0.28); }
#nice h3 { font-size: 17px; color: #059048; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-color: #07c160; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #059048; }
#nice a { color: #07a355; text-decoration: none; border-bottom: 1px solid #a3e4c2; }
#nice strong { color: #059048; }
#nice em { color: #0a7d46; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #07c160; background-color: #f0faf4; color: #52705f; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #0a8f4d; background-color: #eaf7f0; }
#nice th { background-color: #e8f7ee; color: #05753b; }
#nice tr:nth-child(2n) td { background-color: #f4fbf7; }
#nice th, #nice td { border-color: #d5efe0; }
#nice hr { border-top: 1px solid #cdeeda; }
#nice figcaption { color: #86b89b; }
#nice .footnote-ref { color: #07a355; }
#nice .table-of-contents { background-color: #f0faf4; }
`,
};

const techBlue: ThemePreset = {
  id: "tech-blue",
  tag: "技术教程",
  name: "科技蓝",
  color: "#1e6bb8",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #17548f; }
#nice h2 { font-size: 19px; color: #17548f; border-left: 4px solid #1e6bb8; background-image: linear-gradient(90deg, #eff6fc, rgba(239, 246, 252, 0)); border-radius: 0 6px 6px 0; }
#nice h2 .content { display: inline-block; padding: 7px 12px; }
#nice h3 { font-size: 17px; color: #17548f; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-color: #1e6bb8; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #17548f; }
#nice a { color: #1e6bb8; text-decoration: none; border-bottom: 1px solid #a7cbe8; }
#nice strong { color: #17548f; }
#nice em { color: #3f6f9c; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #6ba7d8; background-color: #f2f8fd; color: #4a6a85; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #1a63aa; background-color: #edf4fb; }
#nice th { background-color: #e9f2fa; color: #17548f; }
#nice tr:nth-child(2n) td { background-color: #f5f9fd; }
#nice th, #nice td { border-color: #d3e5f3; }
#nice hr { border-top: 1px solid #cadff0; }
#nice figcaption { color: #8aa9c4; }
#nice .footnote-ref { color: #1e6bb8; }
#nice .table-of-contents { background-color: #f2f8fd; }
`,
};

const lanying: ThemePreset = {
  id: "lanying",
  name: "蓝莹",
  color: "#3aa1f0",
  tag: "技术 · 科普",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #1178d4; }
#nice h2 { font-size: 18px; text-align: center; }
#nice h2 .content { display: inline-block; color: #ffffff; background-image: linear-gradient(102deg, #38a0f2, #1178d4); padding: 5px 20px; border-radius: 6px; font-size: 17px; letter-spacing: 1px; box-shadow: 0 3px 8px rgba(23, 135, 224, 0.25); }
#nice h3 { font-size: 17px; color: #1178d4; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-image: linear-gradient(180deg, #4aa8f5, #1178d4); margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #1178d4; }
#nice a { color: #1178d4; text-decoration: none; border-bottom: 1px solid #9dcdf6; }
#nice strong { color: #0f6ec2; }
#nice em { color: #3a7bb8; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #7cc0f4; background-color: #f0f8ff; color: #4f6b83; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #0f76c9; background-color: #ebf5fd; }
#nice th { background-color: #e8f3fc; color: #1064ab; }
#nice tr:nth-child(2n) td { background-color: #f4f9fe; }
#nice th, #nice td { border-color: #d0e6f8; }
#nice hr { border-top: 1px solid #bfe0f8; }
#nice figcaption { color: #8fb4d1; }
#nice .footnote-ref { color: #1178d4; }
#nice .table-of-contents { background-color: #f0f8ff; }
`,
};

const orangeHeart: ThemePreset = {
  id: "orange-heart",
  tag: "情感 · 生活",
  name: "橙心",
  color: "#ef7060",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #e05442; }
#nice h2 { font-size: 19px; text-align: center; color: #e05442; }
#nice h2 .content { display: inline-block; border-bottom: 3px solid #ef7060; padding: 0 6px 6px 6px; }
#nice h3 { font-size: 17px; color: #e05442; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-color: #ef7060; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #e05442; }
#nice a { color: #e05442; text-decoration: none; border-bottom: 1px solid #f6b3aa; }
#nice strong { color: #d64937; background-image: linear-gradient(transparent 62%, #fde0db 62%); }
#nice em { color: #c25546; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #f2998d; background-color: #fdf4f2; color: #8a625c; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #d95948; background-color: #fdefec; }
#nice th { background-color: #fdeeeb; color: #c24b3b; }
#nice tr:nth-child(2n) td { background-color: #fef6f4; }
#nice th, #nice td { border-color: #f6ddd8; }
#nice hr { border-top: 1px solid #f6d0ca; }
#nice figcaption { color: #cf9c93; }
#nice .footnote-ref { color: #e05442; }
#nice .table-of-contents { background-color: #fdf4f2; }
`,
};

const violet: ThemePreset = {
  id: "violet",
  tag: "时尚 · 女性",
  name: "蔷薇紫",
  color: "#8e44ad",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #7d3c98; }
#nice h2 { font-size: 18px; text-align: center; }
#nice h2 .content { display: inline-block; color: #ffffff; background-image: linear-gradient(102deg, #a25dbd, #8e44ad); padding: 5px 22px; border-radius: 18px; font-size: 17px; letter-spacing: 1px; box-shadow: 0 3px 8px rgba(142, 68, 173, 0.26); }
#nice h3 { font-size: 17px; color: #7d3c98; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-color: #8e44ad; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #7d3c98; }
#nice a { color: #8e44ad; text-decoration: none; border-bottom: 1px solid #d3b3e0; }
#nice strong { color: #7d3c98; }
#nice em { color: #7d5093; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #c9a6d9; background-color: #f8f3fb; color: #6f5680; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #83429f; background-color: #f5edf9; }
#nice th { background-color: #f3eaf8; color: #6e358a; }
#nice tr:nth-child(2n) td { background-color: #f9f4fc; }
#nice th, #nice td { border-color: #e6d5ee; }
#nice hr { border-top: 1px solid #e0cbea; }
#nice figcaption { color: #a58bb4; }
#nice .footnote-ref { color: #8e44ad; }
#nice .table-of-contents { background-color: #f8f3fb; }
`,
};

const ink: ThemePreset = {
  id: "ink",
  tag: "文化 · 散文",
  name: "水墨",
  color: "#576b95",
  css: `
#nice { font-family: Optima, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif; color: #40464f; }
#nice p { color: #40464f; }
#nice h1 { font-size: 21px; text-align: center; color: #2f353d; letter-spacing: 0.15em; }
#nice h2 { font-size: 18px; text-align: center; color: #40464f; letter-spacing: 0.15em; }
#nice h2 .prefix { display: inline-block; width: 24px; height: 1px; background-color: #9aa3b4; vertical-align: middle; margin-right: 14px; }
#nice h2 .suffix { display: inline-block; width: 24px; height: 1px; background-color: #9aa3b4; vertical-align: middle; margin-left: 14px; }
#nice h3 { font-size: 16px; color: #40464f; letter-spacing: 0.1em; }
#nice h3 .prefix { display: inline-block; width: 3px; height: 14px; background-color: #576b95; margin-right: 8px; }
#nice h4 { font-size: 16px; color: #40464f; }
#nice a { color: #576b95; text-decoration: none; border-bottom: 1px dashed #8c9ab8; }
#nice strong { color: #1a1a1a; }
#nice em { color: #576b95; font-style: normal; letter-spacing: 0.05em; }
#nice del { color: #999999; }
#nice blockquote { border-left: 2px solid #b7bfce; background-color: #f6f7f9; color: #666e7e; border-radius: 0; font-size: 15px; }
#nice p code, #nice li code, #nice td code { color: #4f608a; background-color: #eff1f6; }
#nice th { background-color: #f2f4f7; color: #40464f; }
#nice tr:nth-child(2n) td { background-color: #f7f8fa; }
#nice th, #nice td { border-color: #dfe3ea; }
#nice hr { border-top: 1px dashed #c2c8d5; }
#nice figcaption { color: #9aa3b4; letter-spacing: 0.05em; }
#nice .footnote-ref { color: #576b95; }
#nice .table-of-contents { background-color: #f6f7f9; }
`,
};

const chineseRed: ThemePreset = {
  id: "chinese-red",
  tag: "品牌 · 活动",
  name: "绛红",
  color: "#c0392b",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #a93226; }
#nice h2 { font-size: 18px; }
#nice h2 .content { display: inline-block; background-color: #c0392b; color: #ffffff; padding: 5px 18px; border-radius: 6px; font-size: 17px; letter-spacing: 1px; box-shadow: 0 3px 8px rgba(192, 57, 43, 0.25); }
#nice h3 { font-size: 17px; color: #a93226; }
#nice h3 .prefix { display: inline-block; width: 11px; height: 11px; border: 3px solid #c0392b; border-radius: 50%; margin-right: 8px; }
#nice h4 { font-size: 16px; color: #a93226; }
#nice a { color: #c0392b; text-decoration: none; border-bottom: 1px solid #e3a49c; }
#nice strong { color: #a93226; }
#nice em { color: #96473e; }
#nice del { color: #999999; }
#nice blockquote { border-left: 4px solid #c0392b; background-color: #fbf1ef; color: #7a5750; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #b03425; background-color: #faeae7; }
#nice th { background-color: #f9ebe8; color: #a93226; }
#nice tr:nth-child(2n) td { background-color: #fcf4f2; }
#nice th, #nice td { border-color: #f0d5d0; }
#nice hr { border-top: 2px solid #e8c6c0; }
#nice figcaption { color: #c49a92; }
#nice .footnote-ref { color: #c0392b; }
#nice .table-of-contents { background-color: #fbf1ef; }
`,
};

const bambooTeal: ThemePreset = {
  id: "bamboo",
  tag: "国风 · 读书",
  name: "青竹",
  color: "#0e9285",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #0b7268; letter-spacing: 0.1em; }
#nice h2 { font-size: 18px; text-align: center; color: #0e9285; }
#nice h2 .content { display: inline-block; border-top: 1px solid #0e9285; border-bottom: 1px solid #0e9285; padding: 6px 16px; letter-spacing: 0.15em; }
#nice h3 { font-size: 17px; color: #0b7268; }
#nice h3 .prefix { display: inline-block; width: 5px; height: 5px; background-color: #0e9285; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
#nice h3 .suffix { display: inline-block; width: 26px; height: 2px; background-color: #b5e0db; margin-left: 10px; vertical-align: middle; border-radius: 1px; }
#nice h4 { font-size: 16px; color: #0b7268; }
#nice a { color: #0e9285; text-decoration: none; border-bottom: 1px solid #79ccc2; }
#nice strong { color: #0b7268; }
#nice em { color: #37766e; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #6fc4ba; background-color: #edf7f5; color: #4f6f6b; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #0b7268; background-color: #e6f4f2; }
#nice th { background-color: #e6f4f1; color: #0a655c; }
#nice tr:nth-child(2n) td { background-color: #f2faf8; }
#nice th, #nice td { border-color: #cfe9e5; }
#nice hr { border-top: 1px solid #a9dcd6; }
#nice figcaption { color: #7fb3ac; }
#nice .footnote-ref { color: #0e9285; }
#nice .table-of-contents { background-color: #edf7f5; }
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
#nice h1 { font-size: 24px; text-align: center; letter-spacing: 0.05em; color: #1a1a1a; }
#nice h1 .content { display: inline-block; border-bottom: 3px double #1a1a1a; padding-bottom: 8px; }
#nice h2 { font-size: 20px; letter-spacing: 0.05em; color: #1a1a1a; }
#nice h2 .prefix { display: inline-block; width: 28px; height: 3px; background-color: #1a1a1a; vertical-align: middle; margin-right: 12px; }
#nice h3 { font-size: 17px; color: #1a1a1a; }
#nice h3 .content { display: inline-block; border-bottom: 1px solid #1a1a1a; padding-bottom: 3px; }
#nice h4 { font-size: 16px; color: #1a1a1a; }
#nice a { color: #1a1a1a; text-decoration: none; border-bottom: 2px solid #d8c9a3; }
#nice strong { color: #1a1a1a; background-image: linear-gradient(transparent 60%, #efe3c4 60%); }
#nice em { color: #6b5d3f; }
#nice del { color: #999999; }
#nice blockquote { border-left: none; background-color: transparent; text-align: center; color: #6b6b6b; font-size: 17px; padding: 8px 24px; }
#nice blockquote p { line-height: 1.8; text-align: center; }
#nice p code, #nice li code, #nice td code { color: #8a6d1d; background-color: #f7f2e4; }
#nice th { background-color: #f5f1e6; color: #4a4234; }
#nice tr:nth-child(2n) td { background-color: #faf7ef; }
#nice th, #nice td { border-color: #e6dfd0; }
#nice hr { border-top: 3px double #cccccc; }
#nice figcaption { font-style: italic; color: #a39c8c; }
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
#nice h2 .content { display: inline-block; border-bottom: 2px solid #7aa2f7; padding: 0 4px 6px 2px; }
#nice h3 { font-size: 17px; color: #bb9af7; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-color: #bb9af7; margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #7dcfff; }
#nice a { color: #7aa2f7; text-decoration: none; border-bottom: 1px solid #3d59a1; }
#nice strong { color: #ff9e64; }
#nice em { color: #bb9af7; }
#nice del { color: #565f89; }
#nice blockquote { border-left: 3px solid #414868; background-color: #24283b; color: #9aa5ce; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #7dcfff; background-color: #292e42; }
#nice th { background-color: #24283b; color: #7aa2f7; }
#nice tr:nth-child(2n) td { background-color: #1f2335; }
#nice th, #nice td { border-color: #414868; }
#nice hr { border-top: 1px solid #414868; }
#nice figcaption { color: #565f89; }
#nice .footnote-ref { color: #7aa2f7; }
#nice .footnote-item { color: #565f89; }
#nice .table-of-contents { background-color: #24283b; }
#nice .video-placeholder .video-note { background-color: #24283b; border-color: #414868; color: #9aa5ce; }
#nice .math svg { color: #c6cade; }
`,
};

const sakura: ThemePreset = {
  id: "sakura",
  tag: "女性 · 生活",
  name: "樱粉",
  color: "#e8618c",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #d8577f; }
#nice h2 { font-size: 18px; text-align: center; }
#nice h2 .content { display: inline-block; color: #ffffff; background-image: linear-gradient(102deg, #f08bab, #e8618c); padding: 5px 22px; border-radius: 20px; font-size: 17px; letter-spacing: 1px; box-shadow: 0 3px 8px rgba(232, 97, 140, 0.25); }
#nice h3 { font-size: 17px; color: #d8577f; }
#nice h3 .prefix { display: inline-block; width: 10px; height: 10px; background-image: linear-gradient(135deg, #f6b6ca, #e8618c); border-radius: 50% 50% 50% 0; margin-right: 8px; }
#nice h4 { font-size: 16px; color: #d8577f; }
#nice a { color: #e8618c; text-decoration: none; border-bottom: 1px solid #f0a1bb; }
#nice strong { color: #d8577f; }
#nice em { color: #c94f76; }
#nice del { color: #b3b3b3; }
#nice blockquote { border-left: 3px solid #f3b9cc; background-color: #fdf3f7; color: #8a6470; border-radius: 0 10px 10px 0; }
#nice p code, #nice li code, #nice td code { color: #d8577f; background-color: #fceef3; }
#nice th { background-color: #fceef3; color: #c94f76; }
#nice tr:nth-child(2n) td { background-color: #fef6f9; }
#nice th, #nice td { border-color: #f3d4df; }
#nice hr { border-top: 1px dashed #f0a1bb; }
#nice figcaption { color: #c99aa9; }
#nice .footnote-ref { color: #e8618c; }
#nice .table-of-contents { background-color: #fdf3f7; }
`,
};

const minimalGray: ThemePreset = {
  id: "minimal",
  tag: "万字长文",
  name: "极简",
  color: "#8c8c8c",
  css: `
#nice { color: #404040; }
#nice p { line-height: 1.9; color: #404040; }
#nice h1 { font-size: 20px; font-weight: 600; color: #1f1f1f; }
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
#nice hr { border-top: 1px solid #ececec; margin: 40px 0; }
#nice figcaption { color: #a6a6a6; }
#nice .footnote-ref { color: #595959; }
#nice .table-of-contents { background-color: #fafafa; }
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
