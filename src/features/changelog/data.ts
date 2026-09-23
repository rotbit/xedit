/**
 * 更新日志的数据：官网 /changelog 页就是照这份渲染的。
 *
 * 维护约定：每次发版（推 main）之前，把这次用户能感知到的变化记在最前面——
 * 同一天的并进同一条，新的一天就在数组开头加一条。写给用户看的人话，不是 commit message：
 * 说「能做什么了 / 哪里变好了」，不说改了哪个文件。纯重构、纯内部调整不用记。
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
  /** 还没对所有人开放的功能，标一下，免得有人找不到入口 */
  beta?: boolean;
}

export interface ChangelogEntry {
  /** YYYY-MM-DD，同时用作页面锚点 */
  date: string;
  /** 这一天最值得说的一句话 */
  title: string;
  items: ChangeItem[];
}

/** 新的在前 */
export const CHANGELOG: ChangelogEntry[] = [
  {
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
    ],
  },
  {
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
    date: "2026-09-18",
    title: "数据可靠性与编辑性能",
    items: [
      { kind: "improved", text: "完全本地优先：文章先落在本机，云端只是同步目标；离线新建、弱网重试都不会产生重复文章。" },
      { kind: "improved", text: "长文打字、滚动更顺，编辑热路径上的重复计算被清掉了一批。" },
    ],
  },
  {
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
    date: "2026-09-07",
    title: "编辑器体验重做",
    items: [
      { kind: "new", text: "版式节奏重排，选中文字浮出格式工具条，输入 / 唤出斜杠菜单。" },
      { kind: "improved", text: "代码块改成随主题的卡片样式，语言用下拉选，不用手打。" },
    ],
  },
  {
    date: "2026-08-08",
    title: "阅读模式与永久分享链接",
    items: [
      { kind: "new", text: "阅读模式：整块编辑区换成渲染后的成品，宽栏通读。" },
      { kind: "improved", text: "分享链接改为永久有效，阅读区加宽。" },
    ],
  },
  {
    date: "2026-08-03",
    title: "字体颜色与拖拽排序",
    items: [
      { kind: "new", text: "工具栏加字体颜色，选中文字即可上色；同步飞书时颜色双向保留。" },
      { kind: "new", text: "侧栏文件夹与文章可以拖拽排序。" },
      { kind: "improved", text: "图片库改为滚动分页加载，切回来秒开。" },
    ],
  },
];

/** 「2026-09-20」→「2026 年 9 月 20 日」 */
export function formatChangelogDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}
