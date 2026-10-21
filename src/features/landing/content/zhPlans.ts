import type { CompareCopy, FreeCopy } from "./types";

/**
 * Chinese copy for the 「免费范围」 and comparison sections, split from zh.ts to keep it under the size cap.
 * Every limit here mirrors code: MAX_IMAGE_SIZE / MAX_VIDEO_SIZE (lib/media), MAX_VERSIONS_PER_DOC (lib/versions),
 * the per-account storage quota (lib/guards) and the ai_review permission + daily limit (lib/permissions, lib/ai/limit).
 * The storage quota and AI daily count are deployment config, so no numbers are printed for them.
 * Obsidian / Notion cells describe their public feature set as of 2026-10; recheck before relying on them.
 */
export const zhPlans: { free: FreeCopy; compare: CompareCopy } = {
  free: {
    eyebrow: "免费范围",
    title: "免费到什么程度，先说清楚",
    note: "xEdit 目前没有付费套餐，代码以 MIT 协议开源，也可以自己部署。下面是现在的规则和真实限制。",
    tiers: [
      {
        label: "不登录",
        title: "打开就写",
        items: [
          "全部编辑功能：即时渲染、斜杠命令、[[双链]]、待办与「今天」",
          "文章存在当前浏览器，或打开本地文件夹当文库",
          "导出 Markdown、HTML、PDF、长图 PNG、Word",
          "一键复制到公众号、知乎，13 套排版主题",
          "上传图片、分享链接、云同步需要登录",
        ],
      },
      {
        label: "登录后 · 免费",
        title: "云同步与分享",
        items: [
          "文章、文件夹、版本历史和图片同步到云端，网页版与 Mac 客户端共用一份",
          "不限制登录设备数量，断网照写，联网自动补同步",
          "单张图片不超过 10 MB，单个视频不超过 100 MB；每个账号有图片和视频的总存储配额，用满后不能再上传，已有文件不受影响",
          "每篇文章保留最近 100 个版本，更早的自动清理",
          "分享链接与读者批注",
        ],
      },
      {
        label: "AI",
        title: "谁来付费",
        items: [
          "MCP 接入免费：Claude 等客户端授权后读写你的云端文章；客户端本身的订阅或 API 费用由你和该服务商结算",
          "MCP 只能访问云端文章，浏览器本地和本地文件夹里的文章不会被读到",
          "AI 审稿处于内测，按账号逐步开放，每天有次数上限",
          "内测期间审稿的模型费用由 xEdit 承担，不需要自备 API Key",
        ],
      },
    ],
    storageTitle: "三种存储方式",
    storageLabels: { where: "存在哪", sync: "云同步", fit: "适合" },
    storage: [
      {
        name: "浏览器本地",
        where: "不登录时的默认方式，存在当前浏览器里，只有这台设备能看到；清除浏览器网站数据会一并删掉",
        sync: "登录后自动上传到你的云端账号",
        fit: "先试用、临时写一篇",
      },
      {
        name: "本地 Markdown 文件夹",
        where: "不登录时在 Chrome、Edge 里打开电脑上的文件夹，每篇就是一个 .md 文件",
        sync: "不参与云同步，登录后也不会上传；备份用你自己的方式（网盘、Git 等）",
        fit: "想让文件留在自己硬盘上、和其他编辑器共用",
      },
      {
        name: "云端同步",
        where: "登录后以云端为主，本机保留离线镜像",
        sync: "多设备同一份，版本历史、图片和分享链接都在这种方式下",
        fit: "网页版和 Mac 客户端来回切、换电脑也要接着写",
      },
    ],
  },

  compare: {
    eyebrow: "对比",
    title: "和 Obsidian、Notion 比，xEdit 适合谁",
    note: "xEdit 是轻量的 Markdown 写作与笔记工具，不是它们的完整替代。下表按现在的实际功能写，没有的就写没有。",
    rowHead: "能力",
    rows: [
      { label: "价格与源码", xedit: "免费，MIT 开源", obsidian: "个人免费，闭源；官方同步是付费服务", notion: "有免费版，高级功能付费；闭源" },
      { label: "存储格式", xedit: "标准 Markdown 纯文本", obsidian: "本地 Markdown 文件", notion: "云端块结构，可导入导出 Markdown" },
      { label: "Markdown 导入导出", xedit: "导出 .md 即原文，另有 HTML、PDF、PNG、Word", obsidian: "文件本身就是 .md", notion: "支持，复杂页面会有格式损失" },
      { label: "本地文件", xedit: "可打开本地文件夹（Chrome / Edge），不参与云同步", obsidian: "原生本地文库", notion: "以云端为主" },
      { label: "云同步", xedit: "登录后免费", obsidian: "官方 Sync 付费，或自备同步方案", notion: "内置" },
      { label: "免安装", xedit: "网页版打开即用，另有 Mac 客户端", obsidian: "需安装桌面或手机应用", notion: "网页版与各平台应用" },
      { label: "[[笔记链接]]", xedit: "支持，标题补全，改名自动更新引用", obsidian: "支持", notion: "支持页面链接与 @ 提及" },
      { label: "反向链接面板", xedit: "暂无", obsidian: "有", notion: "有" },
      { label: "关系图谱", xedit: "暂无", obsidian: "有", notion: "无" },
      { label: "数据库", xedit: "无，只有普通 Markdown 表格", obsidian: "通过 Bases 等插件", notion: "核心能力" },
      { label: "插件", xedit: "无插件系统，不兼容 Obsidian 插件", obsidian: "丰富的社区插件", notion: "集成与模板" },
      { label: "多人实时协作", xedit: "无；可发分享链接收批注", obsidian: "无", notion: "支持" },
      { label: "AI 接入", xedit: "内置 MCP Server，AI 客户端授权后读写文库", obsidian: "依赖社区插件", notion: "Notion AI 与官方集成" },
      { label: "手机 App", xedit: "暂无", obsidian: "iOS / Android", notion: "iOS / Android" },
    ],
    fitTitle: "xEdit 更合适，如果你",
    fit: [
      "主要用 Markdown 写文章、周报、读书笔记，想要即时渲染，又不想搭一套复杂系统",
      "想要免费的云同步、网页随开随用，或者干脆不注册、文件放在自己的文件夹里",
      "想让 Claude 等 AI 客户端通过 MCP 直接检索、整理、改写你的笔记",
      "写公众号或知乎：排好版一键复制，样式不丢",
    ],
    otherTitle: "这些情况，选 Obsidian 或 Notion 更好",
    other: [
      "要数据库、看板视图或多人实时协作：Notion",
      "离不开反向链接面板、关系图谱或社区插件：Obsidian",
      "主要在手机上记笔记：两者都有原生 App",
      "已有 Obsidian 文库：xEdit 能打开那个文件夹编辑 .md，但插件、配置和画布不会生效",
    ],
    footnote: "Obsidian 与 Notion 的信息依据其公开功能整理（2026 年 10 月），以官方说明为准。",
  },
};
