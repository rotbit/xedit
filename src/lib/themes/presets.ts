// 内置排版主题。每套主题只覆盖颜色与装饰，结构性样式在 base.ts。
// 约定：标题结构为 h2 > span.prefix + span.content + span.suffix
// 设计思路：参考 mdnice / doocs md / 主流大号的排版审美，每套主题一个
// 不重复的「签名造型」（双色下划线 / 荧光笔 / 渐变横条 / 括角 / 印章 / 杂志顶线…），
// 强调色只落在标题装饰、加粗、链接、行内代码上；引用、表格等大块面一律收敛，
// 避免「换个颜色的同一套模板」与大色块 + 投影的旧式胶囊标题。
// 装饰必须用真实元素或背景图（伪元素复制到公众号会丢）。

export interface ThemePreset {
  id: string;
  name: string;
  /** 主题代表色，用于选择器里的色块预览 */
  color: string;
  /** 适用的内容类型，展示在主题卡片上 */
  tag: string;
  css: string;
}

/** 引用块的装饰引号（data-URI SVG，公众号支持背景图，伪元素会丢），color 为不带 # 的 hex */
const quoteMark = (color: string) =>
  `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='23' height='16' viewBox='0 0 23 16'%3E%3Cpath d='M10 0C4 2 0 6.5 0 11a5 5 0 1 0 10 0Z M23 0c-6 2-10 6.5-10 11a5 5 0 1 0 10 0Z' fill='%23${color}'/%3E%3C/svg%3E")`;

// 签名造型：双色下划线（标题下细灰线贯通、文字下压一段粗黑线）
const classic: ThemePreset = {
  id: "classic",
  tag: "技术 · 深度长文",
  name: "经典黑",
  color: "#333333",
  css: `
#nice { color: #2b2b2b; }
#nice h1 { font-size: 22px; text-align: center; color: #1a1a1a; }
#nice h2 { font-size: 20px; color: #1a1a1a; border-bottom: 1px solid #ececec; }
#nice h2 .content { display: inline-block; border-bottom: 3px solid #1a1a1a; padding: 0 2px 8px 2px; margin-bottom: -1px; }
#nice h3 { font-size: 17px; color: #1a1a1a; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #1a1a1a; margin-right: 9px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #1a1a1a; }
#nice a { color: #0969da; text-decoration: none; border-bottom: 1px solid #b6d5f2; }
#nice strong { color: #111111; }
#nice em { color: #555555; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #e0e0e0; background-color: #fafafa; color: #595959; }
#nice p code, #nice li code, #nice td code { color: #d02f55; background-color: #f8f1f3; }
#nice th { background-color: #f5f5f5; }
#nice hr { border-top: 1px solid #e8e8e8; }
#nice figcaption { color: #a3a3a3; }
#nice .footnote-ref { color: #0969da; }
`,
};

// 签名造型：荧光笔标记标题（正文黑标题压一道半透明绿），引用是无边圆角卡片
const wechatGreen: ThemePreset = {
  id: "wechat-green",
  tag: "职场 · 生活",
  name: "微信绿",
  color: "#07c160",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #067f42; }
#nice h2 { font-size: 20px; color: #1f1f1f; }
#nice h2 .content { display: inline-block; padding: 0 5px 3px 2px; background-image: linear-gradient(transparent 60%, rgba(7, 193, 96, 0.22) 60%); }
#nice h3 { font-size: 17px; color: #067f42; }
#nice h3 .prefix { display: inline-block; width: 7px; height: 7px; background-color: #07c160; border-radius: 50%; margin-right: 9px; vertical-align: middle; }
#nice h4 { font-size: 16px; color: #067f42; }
#nice a { color: #07a355; text-decoration: none; border-bottom: 1px solid #a8e6c5; }
#nice strong { color: #067f42; }
#nice em { color: #3c7d5b; }
#nice del { color: #999999; }
#nice blockquote { border-left: none; background-color: #f2f9f5; color: #52705f; border-radius: 8px; padding: 8px 18px; }
#nice p code, #nice li code, #nice td code { color: #0a8f4d; background-color: #ebf7f0; }
#nice th { background-color: #ecf8f1; color: #056b36; }
#nice th, #nice td { border-color: #dcefe4; }
#nice hr { border-top: 1px solid #d8efe2; }
#nice figcaption { color: #8cb9a0; }
#nice .footnote-ref { color: #07a355; }
#nice .table-of-contents { background-color: #f2f9f5; }
`,
};

// 签名造型：左竖线 + 向右消失的浅蓝渐变洗底，h3 用小方框
const techBlue: ThemePreset = {
  id: "tech-blue",
  tag: "技术教程",
  name: "科技蓝",
  color: "#1e6bb8",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #14508c; }
#nice h2 { font-size: 19px; color: #14508c; border-left: 4px solid #1e6bb8; background-image: linear-gradient(90deg, #eef5fc, rgba(238, 245, 252, 0) 85%); border-radius: 0 6px 6px 0; }
#nice h2 .content { display: inline-block; padding: 8px 12px; }
#nice h3 { font-size: 17px; color: #14508c; }
#nice h3 .prefix { display: inline-block; width: 8px; height: 8px; border: 2px solid #1e6bb8; border-radius: 2px; margin-right: 9px; vertical-align: middle; }
#nice h4 { font-size: 16px; color: #14508c; }
#nice a { color: #1e6bb8; text-decoration: none; border-bottom: 1px solid #a7cbe8; }
#nice strong { color: #14508c; }
#nice em { color: #3f6f9c; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #7fb3e3; background-color: #f3f8fd; color: #4a6a85; }
#nice p code, #nice li code, #nice td code { color: #1a63aa; background-color: #edf4fb; }
#nice th { background-color: #e9f2fa; color: #14508c; }
#nice tr:nth-child(2n) td { background-color: #f7fafd; }
#nice th, #nice td { border-color: #d3e5f3; }
#nice hr { border-top: 1px solid #cadff0; }
#nice figcaption { color: #8aa9c4; }
#nice .footnote-ref { color: #1e6bb8; }
#nice .table-of-contents { background-color: #f3f8fd; }
`,
};

// 签名造型：通栏渐变横条标题（白字、缺一角的圆角），h3 渐变竖线
const lanying: ThemePreset = {
  id: "lanying",
  name: "蓝莹",
  color: "#3aa1f0",
  tag: "技术 · 科普",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #0e6fd0; }
#nice h2 { font-size: 18px; }
#nice h2 .content { display: block; color: #ffffff; background-image: linear-gradient(135deg, #38a0f2, #0e6fd0); padding: 8px 16px; border-radius: 8px 8px 8px 0; font-size: 17px; letter-spacing: 1px; }
#nice h3 { font-size: 17px; color: #0e6fd0; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-image: linear-gradient(180deg, #4aa8f5, #0e6fd0); margin-right: 8px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #0e6fd0; }
#nice a { color: #0e6fd0; text-decoration: none; border-bottom: 1px solid #9dcdf6; }
#nice strong { color: #0c62b8; }
#nice em { color: #3a7bb8; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #58aef3; background-color: #f0f7fe; color: #4f6b83; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #0d67c2; background-color: #ecf5fd; }
#nice th { background-color: #e8f3fc; color: #0b5aa8; }
#nice tr:nth-child(2n) td { background-color: #f5fafe; }
#nice th, #nice td { border-color: #d0e6f8; }
#nice hr { border-top: 1px solid #c5e2f8; }
#nice figcaption { color: #8fb4d1; }
#nice .footnote-ref { color: #0e6fd0; }
#nice .table-of-contents { background-color: #f0f7fe; }
`,
};

// 签名造型：橙底白字标签式 h2 + 右侧折角（suffix 三角）+ 通栏橙色底线，引用为橙线暖底卡片
const orangeHeart: ThemePreset = {
  id: "orange-heart",
  tag: "情感 · 生活",
  name: "橙心",
  color: "#ef7060",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #e05442; }
#nice h2 { font-size: 18px; border-bottom: 2px solid #ef7060; }
#nice h2 .content { display: inline-block; background-color: #ef7060; color: #ffffff; padding: 5px 14px 4px 14px; border-radius: 3px 3px 0 0; margin-right: 3px; }
#nice h2 .suffix { display: inline-block; vertical-align: bottom; border-bottom: 32px solid #f2e6e2; border-right: 18px solid transparent; }
#nice h3 { font-size: 17px; color: #e05442; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #ef7060; margin-right: 9px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #e05442; }
#nice a { color: #e05442; text-decoration: none; border-bottom: 1px solid #f6b3aa; }
#nice strong { color: #d64937; background-image: linear-gradient(transparent 62%, #fde3de 62%); }
#nice em { color: #c25546; }
#nice del { color: #999999; }
#nice blockquote { border-left: 4px solid #ef7060; background-color: #fdf2ee; color: #595959; padding: 10px 16px; }
#nice p code, #nice li code, #nice td code { color: #d95948; background-color: #fdf0ed; }
#nice th { background-color: #fdefec; color: #c24b3b; }
#nice th, #nice td { border-color: #f6ddd8; }
#nice hr { border-top: 1px solid #f3d6d0; }
#nice figcaption { color: #cf9c93; }
#nice .footnote-ref { color: #e05442; }
#nice .table-of-contents { background-color: #fdf5f3; }
`,
};

// 签名造型：居中细字距标题、两侧小圆点 + 浅紫细下划线，引用描边圆卡
const violet: ThemePreset = {
  id: "violet",
  tag: "时尚 · 女性",
  name: "蔷薇紫",
  color: "#8e44ad",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #7d3c98; }
#nice h2 { font-size: 19px; text-align: center; color: #6d3487; letter-spacing: 0.08em; }
#nice h2 .prefix { display: inline-block; width: 5px; height: 5px; background-color: #b98fd0; border-radius: 50%; margin-right: 12px; vertical-align: middle; }
#nice h2 .suffix { display: inline-block; width: 5px; height: 5px; background-color: #b98fd0; border-radius: 50%; margin-left: 12px; vertical-align: middle; }
#nice h2 .content { display: inline-block; border-bottom: 2px solid #d9bce9; padding: 0 3px 6px 3px; }
#nice h3 { font-size: 17px; color: #6d3487; }
#nice h3 .prefix { display: inline-block; width: 4px; height: 15px; background-color: #a25dbd; margin-right: 9px; border-radius: 2px; }
#nice h4 { font-size: 16px; color: #6d3487; }
#nice a { color: #8e44ad; text-decoration: none; border-bottom: 1px solid #d3b3e0; }
#nice strong { color: #7d3c98; background-image: linear-gradient(transparent 62%, #f0e4f7 62%); }
#nice em { color: #7d5093; }
#nice del { color: #999999; }
#nice blockquote { border: 1px solid #e9dbf2; background-color: #faf7fc; color: #6f5680; border-radius: 12px; padding: 8px 18px; }
#nice p code, #nice li code, #nice td code { color: #83429f; background-color: #f6effa; }
#nice th { background-color: #f4ecf9; color: #6e358a; }
#nice th, #nice td { border-color: #e7d8ef; }
#nice hr { border-top: 1px solid #e2cdec; }
#nice figcaption { color: #a58bb4; }
#nice .footnote-ref { color: #8e44ad; }
#nice .table-of-contents { background-color: #faf7fc; }
`,
};

// 签名造型：「」括角标题（prefix/suffix 各画两条边拼成引号角），引用只留一条细线
const ink: ThemePreset = {
  id: "ink",
  tag: "文化 · 散文",
  name: "水墨",
  color: "#576b95",
  css: `
#nice { font-family: Optima, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif; color: #40464f; }
#nice p { color: #40464f; }
#nice h1 { font-size: 21px; text-align: center; color: #2f353d; letter-spacing: 0.15em; }
#nice h2 { font-size: 18px; text-align: center; color: #2f353d; letter-spacing: 0.15em; }
#nice h2 .prefix { display: inline-block; width: 10px; height: 10px; border-left: 2px solid #7c8aa8; border-top: 2px solid #7c8aa8; margin-right: 10px; vertical-align: text-top; }
#nice h2 .suffix { display: inline-block; width: 10px; height: 10px; border-right: 2px solid #7c8aa8; border-bottom: 2px solid #7c8aa8; margin-left: 10px; vertical-align: text-bottom; }
#nice h3 { font-size: 16px; color: #40464f; letter-spacing: 0.1em; }
#nice h3 .prefix { display: inline-block; width: 6px; height: 6px; border: 1px solid #576b95; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
#nice h4 { font-size: 16px; color: #40464f; }
#nice a { color: #576b95; text-decoration: none; border-bottom: 1px dashed #8c9ab8; }
#nice strong { color: #1a1a1a; }
#nice em { color: #576b95; font-style: normal; letter-spacing: 0.05em; }
#nice del { color: #999999; }
#nice blockquote { border-left: 1px solid #c3cad6; background-color: transparent; color: #666e7e; padding: 2px 0 2px 16px; font-size: 15px; }
#nice p code, #nice li code, #nice td code { color: #4f608a; background-color: #eff1f6; }
#nice th { background-color: #f2f4f7; color: #40464f; }
#nice tr:nth-child(2n) td { background-color: transparent; }
#nice th, #nice td { border-color: #dfe3ea; }
#nice hr { border-top: 1px dashed #c2c8d5; }
#nice figcaption { color: #9aa3b4; letter-spacing: 0.05em; }
#nice .footnote-ref { color: #576b95; }
#nice .table-of-contents { background-color: #f6f7f9; }
`,
};

// 签名造型：印章式标题——正红方块字 + 右下角错位的浅色硬投影，h3 小方印
const chineseRed: ThemePreset = {
  id: "chinese-red",
  tag: "品牌 · 活动",
  name: "绛红",
  color: "#c0392b",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #a93226; }
#nice h2 { font-size: 18px; }
#nice h2 .content { display: inline-block; background-color: #c0392b; color: #ffffff; padding: 6px 18px; font-size: 17px; letter-spacing: 2px; border-radius: 2px; box-shadow: 4px 4px 0 #f5ddd9; }
#nice h3 { font-size: 17px; color: #a93226; }
#nice h3 .prefix { display: inline-block; width: 8px; height: 8px; background-color: #c0392b; border-radius: 1px; margin-right: 9px; vertical-align: middle; }
#nice h4 { font-size: 16px; color: #a93226; }
#nice a { color: #c0392b; text-decoration: none; border-bottom: 1px solid #e3a49c; }
#nice strong { color: #a93226; }
#nice em { color: #96473e; }
#nice del { color: #999999; }
#nice blockquote { border-left: 3px solid #d98479; background-color: #fbf3f1; color: #7a5750; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #b03425; background-color: #faece9; }
#nice th { background-color: #f9ebe8; color: #a93226; }
#nice th, #nice td { border-color: #f0d5d0; }
#nice hr { border-top: 1px solid #ecccc6; }
#nice figcaption { color: #c49a92; }
#nice .footnote-ref { color: #c0392b; }
#nice .table-of-contents { background-color: #fbf3f1; }
`,
};

// 签名造型：匾额式上下细线居中标题，h3 圆点 + 尾线
const bambooTeal: ThemePreset = {
  id: "bamboo",
  tag: "国风 · 读书",
  name: "青竹",
  color: "#0e9285",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #0b7268; letter-spacing: 0.1em; }
#nice h2 { font-size: 18px; text-align: center; color: #0e9285; letter-spacing: 0.15em; }
#nice h2 .content { display: inline-block; border-top: 1px solid #0e9285; border-bottom: 1px solid #0e9285; padding: 6px 18px; }
#nice h3 { font-size: 17px; color: #0b7268; }
#nice h3 .prefix { display: inline-block; width: 5px; height: 5px; background-color: #0e9285; border-radius: 50%; margin-right: 7px; vertical-align: middle; }
#nice h3 .suffix { display: inline-block; width: 26px; height: 2px; background-color: #b5e0db; margin-left: 10px; vertical-align: middle; border-radius: 1px; }
#nice h4 { font-size: 16px; color: #0b7268; }
#nice a { color: #0e9285; text-decoration: none; border-bottom: 1px solid #79ccc2; }
#nice strong { color: #0b7268; }
#nice em { color: #37766e; }
#nice del { color: #999999; }
#nice blockquote { border-left: 2px solid #8fd0c8; background-color: #f3faf8; color: #4f6f6b; border-radius: 0 8px 8px 0; }
#nice p code, #nice li code, #nice td code { color: #0b7268; background-color: #e9f5f2; }
#nice th { background-color: #e9f5f2; color: #0a655c; }
#nice th, #nice td { border-color: #d4eae6; }
#nice hr { border-top: 1px solid #b9e2dc; }
#nice figcaption { color: #7fb3ac; }
#nice .footnote-ref { color: #0e9285; }
#nice .table-of-contents { background-color: #f0f8f6; }
`,
};

// 签名造型：杂志顶线——h2 上方一条通栏黑细线，衬线字，引用居中配金色引号
const magazine: ThemePreset = {
  id: "magazine",
  tag: "深度 · 评论",
  name: "杂志风",
  color: "#1a1a1a",
  css: `
#nice { font-family: Optima, Georgia, "Songti SC", "Noto Serif SC", serif; color: #2b2b2b; }
#nice p { line-height: 1.85; }
#nice h1 { font-size: 24px; text-align: center; letter-spacing: 0.05em; color: #1a1a1a; }
#nice h1 .content { display: inline-block; border-bottom: 3px double #1a1a1a; padding-bottom: 8px; }
#nice h2 { font-size: 20px; letter-spacing: 0.05em; color: #1a1a1a; border-top: 1px solid #1a1a1a; padding-top: 12px; }
#nice h3 { font-size: 17px; color: #1a1a1a; }
#nice h3 .content { display: inline-block; border-bottom: 1px solid #1a1a1a; padding-bottom: 3px; }
#nice h4 { font-size: 16px; color: #1a1a1a; }
#nice a { color: #1a1a1a; text-decoration: none; border-bottom: 2px solid #d8c9a3; }
#nice strong { color: #1a1a1a; background-image: linear-gradient(transparent 60%, #efe3c4 60%); }
#nice em { color: #6b5d3f; }
#nice del { color: #999999; }
#nice blockquote { border-left: none; background-color: transparent; text-align: center; color: #6b6b6b; font-size: 17px; padding: 26px 24px 6px 24px; background-image: ${quoteMark("d8c9a3")}; background-repeat: no-repeat; background-position: center 4px; background-size: 24px 17px; }
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

// 签名造型：暗底 Tokyo Night 配色，h2 蓝紫渐变下划线
const nightIndigo: ThemePreset = {
  id: "night",
  tag: "程序员 · 夜读",
  name: "靛夜",
  color: "#1a1b26",
  css: `
#nice { background-color: #1a1b26; color: #c6cade; }
#nice p { color: #c6cade; }
#nice h1 { font-size: 22px; text-align: center; color: #7aa2f7; }
#nice h2 { font-size: 19px; color: #7aa2f7; }
#nice h2 .content { display: inline-block; padding: 0 2px 8px 2px; background-image: linear-gradient(90deg, #7aa2f7, #bb9af7); background-repeat: no-repeat; background-size: 100% 3px; background-position: 0 100%; }
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

// 签名造型：居中荧光粉标记标题 + 花瓣 h3，引用是虚线描边的圆角卡片
const sakura: ThemePreset = {
  id: "sakura",
  tag: "女性 · 生活",
  name: "樱粉",
  color: "#e8618c",
  css: `
#nice h1 { font-size: 22px; text-align: center; color: #d8577f; }
#nice h2 { font-size: 19px; text-align: center; color: #2f2f2f; }
#nice h2 .content { display: inline-block; padding: 0 6px 3px 6px; background-image: linear-gradient(transparent 58%, #fbdce6 58%); }
#nice h3 { font-size: 17px; color: #d8577f; }
#nice h3 .prefix { display: inline-block; width: 10px; height: 10px; background-image: linear-gradient(135deg, #f6b6ca, #e8618c); border-radius: 50% 50% 50% 0; margin-right: 8px; }
#nice h4 { font-size: 16px; color: #d8577f; }
#nice a { color: #e8618c; text-decoration: none; border-bottom: 1px solid #f0a1bb; }
#nice strong { color: #d8577f; }
#nice em { color: #c94f76; }
#nice del { color: #b3b3b3; }
#nice blockquote { border: 1px dashed #f3c3d3; background-color: #fdf6f9; color: #8a6470; border-radius: 12px; padding: 8px 18px; }
#nice p code, #nice li code, #nice td code { color: #d8577f; background-color: #fcf0f4; }
#nice th { background-color: #fceff4; color: #c94f76; }
#nice th, #nice td { border-color: #f5d9e2; }
#nice hr { border-top: 1px dashed #f0b6c8; }
#nice figcaption { color: #c99aa9; }
#nice .footnote-ref { color: #e8618c; }
#nice .table-of-contents { background-color: #fdf6f9; }
`,
};

// 签名造型：没有造型——纯字重与灰阶分层，适合不想被主题抢戏的万字长文
const minimalGray: ThemePreset = {
  id: "minimal",
  tag: "万字长文",
  name: "极简",
  color: "#8c8c8c",
  css: `
#nice { color: #3d3d3d; }
#nice p { line-height: 1.9; color: #3d3d3d; }
#nice h1 { font-size: 21px; font-weight: 600; color: #1f1f1f; }
#nice h2 { font-size: 18px; font-weight: 600; color: #1f1f1f; }
#nice h3 { font-size: 16px; font-weight: 600; color: #1f1f1f; }
#nice h4 { font-size: 15px; font-weight: 600; color: #404040; }
#nice a { color: #1f1f1f; text-decoration: none; border-bottom: 1px solid #c9c9c9; }
#nice strong { color: #000000; font-weight: 600; }
#nice em { color: #595959; }
#nice del { color: #a6a6a6; }
#nice blockquote { border-left: 2px solid #e0e0e0; background-color: transparent; color: #8c8c8c; padding: 1px 18px; }
#nice p code, #nice li code, #nice td code { color: #595959; background-color: #f5f5f5; }
#nice th { background-color: #fafafa; }
#nice th, #nice td { border-color: #eaeaea; }
#nice hr { border-top: 1px solid #eeeeee; margin: 44px 0; }
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
