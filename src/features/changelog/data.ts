/**
 * Changelog data: the site's /changelog page renders straight from this.
 *
 * Maintenance convention: every release (push to main) gets a new entry at the top with a bumped version, and
 * package.json's "version" is bumped to match (a test keeps them in sync). Bump the minor version when the release
 * brings a new feature, otherwise the patch version. Write plain language for users, not commit messages:
 * say "what you can do now / what got better", not which files changed. Pure refactors and internal tweaks go unlisted,
 * but a release made only of them still gets its version and a one-line entry.
 */

export type ChangeKind = "new" | "improved" | "fixed";

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  new: "新功能",
  improved: "优化",
  fixed: "修复",
};

export interface ChangeItem {
  kind: ChangeKind;
  text: string;
  /** Features not yet open to everyone are flagged, so people don't go hunting for a missing entry point */
  beta?: boolean;
}

export interface ChangelogEntry {
  /** Semver "x.y.z", one per release; also the page anchor (v0.2.0) */
  version: string;
  /** YYYY-MM-DD release date; several releases can share a day */
  date: string;
  /** The one line most worth saying about this day */
  title: string;
  items: ChangeItem[];
}

/** Newest first */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.6.2",
    date: "2026-10-27",
    title: "待办行悬停不再跳动",
    items: [{ kind: "fixed", text: "鼠标移到待办上时，操作按钮改为浮在行尾上方，正文和标签不再被挤得来回移动。" }],
  },
  {
    version: "0.6.1",
    date: "2026-10-27",
    title: "今天页卡片去阴影",
    items: [
      { kind: "improved", text: "今天页的待办卡片去掉了阴影，只留一圈细边，看起来更干净。" },
      { kind: "fixed", text: "窗口较窄时，待办标题不再被行尾的隐藏按钮挤成一行几个字，关联的文章名也能完整显示。" },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-10-27",
    title: "今天页换新装",
    items: [
      { kind: "new", text: "今天页右上角多了「今日完成」进度环，勾掉几条、还剩几条一眼看清。" },
      {
        kind: "improved",
        text: "今天页整体换了新样子：待办清单放进白色卡片，完成、进度、排期统一用一抹薄荷青，「每天」「第 N 天」「逾期」变成小标签，关联的文章也更显眼。",
      },
      { kind: "improved", text: "右侧「接下来」里没有安排的日子直接写明「没有安排」，不再只是一个破折号；明天的标签也用青色标出。" },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-10-27",
    title: "今日笔记，待办拖动排序",
    items: [
      {
        kind: "new",
        text: "新增「今日笔记」：今天页日期旁、新建菜单和命令面板都能一键打开当天的日记，第一次打开自动创建在「日记」分类，模板里有日记模板就按模板起稿。",
      },
      { kind: "new", text: "今天页的待办可以按住上下拖动排序，松手就落位；顺序存在待办清单里，各设备保持一致。" },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-10-21",
    title: "官网讲清免费范围，新增与 Notion / Obsidian 的对比",
    items: [
      {
        kind: "new",
        text: "官网新增「免费范围」：不登录能用什么、登录后免费的云同步与各项限制、MCP 和 AI 审稿的费用由谁承担，以及三种存储方式的区别。",
      },
      { kind: "new", text: "官网新增与 Obsidian、Notion 的逐项对比，写明 xEdit 有什么、没有什么、什么时候选别家更合适。" },
      { kind: "improved", text: "产品定位统一为「免费、开源的 Markdown 写作与轻量笔记工具」，中英日三语页面与 README 同步更新。" },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-10-20",
    title: "代码块一键复制",
    items: [
      { kind: "new", text: "代码块右上角新增「复制」按钮，点一下就复制整块代码，不带 ``` 围栏。" },
      {
        kind: "fixed",
        text: "拖选代码块时多扫到卡片上下的空行，复制出来也只有代码，不会再混进 ``` 和空行。",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-10-20",
    title: "代码块选中与复制更顺手，更新日志有了版本号",
    items: [
      {
        kind: "improved",
        text: "官网改版：重新定位为「本地优先的 Markdown 写作工具」，提供中文、英文、日文三种语言。",
      },
      {
        kind: "fixed",
        text: "在代码块里拖选时，选中高亮整齐地落在代码文字区域，不再错位、溢出卡片边框。",
      },
      {
        kind: "fixed",
        text: "在代码块里拖选复制，不会再把首尾的 ``` 围栏行一起复制进去。",
      },
      {
        kind: "fixed",
        text: "拖选文字的过程中格式工具条不再弹出挡住视线，松开鼠标后才出现；从下往上拖也能选到代码块第一行。",
      },
      { kind: "new", text: "更新日志标注版本号，之后每次发布都会递增并记录在这里。" },
    ],
  },
  {
    version: "0.1.10",
    date: "2026-09-23",
    title: "主题去掉文字背景渐变，适配公众号深色模式",
    items: [
      {
        kind: "fixed",
        text: "主题去掉文字背景渐变，复制到公众号不再触发「内容结构检测」的渐变提示，深色模式下高亮更清晰。",
      },
      {
        kind: "fixed",
        text: "链接转成的脚注上标不再触发公众号「行高小于字体大小」的检测提示。",
      },
      {
        kind: "fixed",
        text: "段落里夹着加粗、链接等行内元素时，复制到公众号不再误报「行高小于字体大小，可能导致文字重叠」；正文行高、字号也会完整带进公众号。",
      },
      {
        kind: "improved",
        text: "工作台顶栏的「新建文章」按钮改成轻量描边样式，和旁边的视图切换器风格统一。",
      },
    ],
  },
  {
    version: "0.1.9",
    date: "2026-09-20",
    title: "AI 文章审核上线内测，官网有了更新日志",
    items: [
      {
        kind: "new",
        beta: true,
        text: "AI 文章审核：AI 通读全文，把意见直接标在正文对应的句子上，右侧一栏意见卡，一键采纳、忽略，⌘Z 可撤回。",
      },
      {
        kind: "new",
        beta: true,
        text: "审核类型可多选：「表述审核」和「公众号合规审核」可以一起勾，一次审完、合成一份结果。",
      },
      {
        kind: "new",
        beta: true,
        text: "审核历史：每次审核的意见自动保存，关掉也不丢，随时翻出来回看，不用重新审一遍。",
      },
      {
        kind: "improved",
        beta: true,
        text: "「总评」改成宽幅阅读面板；AI 审稿过程中有明确的进度与耗时提示。",
      },
      {
        kind: "improved",
        text: "官网落地页改版：新的配色与版式，内容围绕干净的编辑器、13 套排版主题、AI 内容审核、一键发布公众号重写。",
      },
      { kind: "new", text: "官网新增「更新日志」页，以后每次更新都会记在这里。" },
      { kind: "new", text: "官网页脚加上了联系邮箱，问题与建议可以直接写信。" },
    ],
  },
  {
    version: "0.1.8",
    date: "2026-09-19",
    title: "文章封面，以及桌面端一键发送到公众号",
    items: [
      { kind: "new", text: "文章封面：封面存在文章里，在正文顶部直接渲染成与正文同宽的题图。" },
      { kind: "new", text: "设置封面支持从正文里选图、上传图片。" },
      { kind: "new", beta: true, text: "AI 生成封面：按文章标题套用固定的封面模板出图。" },
      {
        kind: "new",
        text: "Mac 客户端：「发送到公众号」把标题、正文和封面填进公众号草稿，默认只填好不保存，由你自己确认。",
      },
      { kind: "improved", text: "公众号不支持的视频会在草稿里留下醒目的黄色占位提醒，不会悄悄丢失。" },
      { kind: "improved", text: "品牌图标换成蓝 + 薄荷青双色的书页。" },
    ],
  },
  {
    version: "0.1.7",
    date: "2026-09-18",
    title: "数据可靠性与编辑性能",
    items: [
      { kind: "improved", text: "完全本地优先：文章先落在本机，云端只是同步目标；离线新建、弱网重试都不会产生重复文章。" },
      { kind: "improved", text: "长文打字、滚动更顺，编辑热路径上的重复计算被清掉了一批。" },
    ],
  },
  {
    version: "0.1.6",
    date: "2026-09-17",
    title: "编辑体验整体打磨",
    items: [
      { kind: "new", text: "成对符号自动补全，列表与表格里的回车 / Tab 更顺手，标题可折叠，支持行内公式与脚注。" },
      { kind: "improved", text: "带颜色的文字不再因为光标经过就摊开成源码。" },
      { kind: "fixed", text: "断网或服务器暂时不可达时不再被踢回未登录；登录有效期延长到一年。" },
      { kind: "fixed", text: "目录跳转落点不准、滑动一卡一卡的问题。" },
      { kind: "fixed", text: "编辑图片源码时图片会消失的问题。" },
    ],
  },
  {
    version: "0.1.5",
    date: "2026-09-16",
    title: "图片库重做，支持导入 Markdown",
    items: [
      { kind: "new", text: "图片库改成网格 + 右侧详情栏，记录图片尺寸，可按类型、是否被引用过滤。" },
      { kind: "new", text: "导入 Markdown 文件或整个文件夹。" },
      { kind: "improved", text: "即时渲染改为增量扫描，公式引擎只加载一次，长文编辑明显更快。" },
      { kind: "fixed", text: "导出 PDF 偶发空白、分享页轮询打断读者阅读的问题。" },
    ],
  },
  {
    version: "0.1.4",
    date: "2026-09-15",
    title: "微信扫码登录，侧栏向 Obsidian 看齐",
    items: [
      { kind: "new", text: "微信扫码登录。" },
      { kind: "new", text: "阅读模式左侧加了大纲导航，可收起。" },
      { kind: "improved", text: "侧栏文件树对齐 Obsidian 的使用习惯：文件夹顶格平铺、右键菜单、缩进引导线。" },
      { kind: "improved", text: "文档列表切换分类改为整体淡入，去掉逐行动画。" },
    ],
  },
  {
    version: "0.1.3",
    date: "2026-09-11",
    title: "新品牌标识，Mac 客户端标题栏",
    items: [
      { kind: "new", text: "全新 xEdit 字标与书页图标。" },
      { kind: "new", text: "一键复制菜单顶部显示当前排版主题，可就地切换。" },
      { kind: "new", text: "文档卡片视图改为按日期分组的时间流。" },
      { kind: "improved", text: "嵌套列表加缩进引导线，折行悬挂缩进；目录改为左上角折叠入口。" },
      { kind: "improved", text: "Mac 客户端：顶栏充当系统标题栏，可拖拽，给红绿灯留了位置。" },
    ],
  },
  {
    version: "0.1.2",
    date: "2026-09-07",
    title: "编辑器体验重做",
    items: [
      { kind: "new", text: "版式节奏重排，选中文字浮出格式工具条，输入 / 唤出斜杠菜单。" },
      { kind: "improved", text: "代码块改成随主题的卡片样式，语言用下拉选，不用手打。" },
    ],
  },
  {
    version: "0.1.1",
    date: "2026-08-08",
    title: "阅读模式与永久分享链接",
    items: [
      { kind: "new", text: "阅读模式：整块编辑区换成渲染后的成品，宽栏通读。" },
      { kind: "improved", text: "分享链接改为永久有效，阅读区加宽。" },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-08-03",
    title: "字体颜色与拖拽排序",
    items: [
      { kind: "new", text: "工具栏加字体颜色，选中文字即可上色；同步飞书时颜色双向保留。" },
      { kind: "new", text: "侧栏文件夹与文章可以拖拽排序。" },
      { kind: "improved", text: "图片库改为滚动分页加载，切回来秒开。" },
    ],
  },
];

/** Current release version (the newest entry's) */
export const APP_VERSION = CHANGELOG[0].version;

/** "2026-09-20" → 「2026 年 9 月 20 日」 */
export function formatChangelogDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}
