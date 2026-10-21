import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME } from "@/lib/site";
import type { LandingCopy } from "./types";
import { zhChrome } from "./zhChrome";
import { zhFaq } from "./zhFaq";
import { zhPlans } from "./zhPlans";

/**
 * Chinese landing copy: the source every other locale is translated from.
 * Honesty rule: every claim here must be true of the shipped code (no backlinks panel, graph view or databases);
 * when a feature changes, recheck the matching lines here, the FAQ and the feature grid together.
 * The copy also carries long-tail search terms, so keep concrete how-tos rather than turning them into adjectives.
 */
export const zh: LandingCopy = {
  lang: "zh-CN",
  chrome: zhChrome,

  hero: {
    badge: "免费 · MIT 开源",
    titleLine1: "像 Obsidian 一样本地优先，",
    titleLine2Before: "像 Notion 一样",
    titleMark: "顺手好写",
    titleLine2After: "",
    sub: "即时渲染的 Markdown 编辑器：[[双链]]把笔记串起来，斜杠命令插入任何块，待办自动汇总进「今天」。文章存在本地文件夹或同步到云端，还能通过 MCP 让 AI 直接读写。",
    macCta: "获取 Mac 客户端",
    githubCta: "GitHub 源码",
    note: "不用注册，打开就写；文章先存在这台设备，登录后自动同步到云端",
    stats: [
      { value: "0 元", label: "全部写作功能" },
      { value: "MIT", label: "开源协议" },
      { value: "MCP", label: "原生接入 AI" },
    ],
    visualLabel: "PREVIEW",
    visualCaption: "写的就是看到的：链接、提示块、待办在编辑区里直接渲染",
  },

  mockup: {
    windowTitle: "写作工作流",
    syncStatus: "已同步",
    searchPlaceholder: "搜索",
    today: "今天",
    todayCount: "3",
    foldersLabel: "文件夹",
    folders: [
      { name: "读书笔记" },
      { name: "写作", docs: ["写作工作流", "选题清单"] },
      { name: "周报" },
    ],
    activeDoc: "写作工作流",
    breadcrumb: "写作",
    docTitle: "写作工作流",
    paraBefore: "所有草稿都是纯文本 Markdown，相关的想法用 ",
    wikiLink: "卡片笔记法",
    paraAfter: " 串起来；改了标题，指向它的链接会跟着更新。",
    calloutBadge: "提示",
    calloutText: "按 / 唤出命令菜单，标题、表格、提示块都不用记语法。",
    tasksHeading: "本周待办",
    tasks: [
      { text: "整理上周的读书摘录", done: true },
      { text: "写完第三章初稿", due: "明天" },
      { text: "晨间写作 500 字", due: "每天" },
    ],
    slashQuery: "/",
    slashItems: [
      { icon: "h2", label: "二级标题", hint: "##" },
      { icon: "callout", label: "提示块", hint: "> [!tip]" },
      { icon: "todo", label: "待办列表", hint: "- [ ]" },
      { icon: "table", label: "表格", hint: "|" },
      { icon: "code", label: "代码块", hint: "```" },
      { icon: "image", label: "图片", hint: "![]" },
    ],
    wordCount: "1,286 字",
  },

  pillars: {
    srTitle: "xEdit 的四个出发点：本地优先、顺手好写、AI 原生、随处可写",
    items: [
      {
        icon: "obsidian",
        kicker: "像 Obsidian",
        title: "纯文本，归你所有",
        desc: "每篇都是标准 Markdown，[[双链]] 按标题互相引用；可以直接把电脑上的文件夹当文库。",
        tags: ["Markdown", "双链", "本地文件夹"],
      },
      {
        icon: "notion",
        kicker: "像 Notion",
        title: "不记语法也能写",
        desc: "输入 / 唤出命令菜单，提示块、表格、待办随手插；文章和文件夹拖一拖就整理好。",
        tags: ["斜杠命令", "提示块", "拖拽整理"],
      },
      {
        icon: "ai",
        kicker: "AI 原生",
        title: "让 AI 进你的文库",
        desc: "内置 MCP Server，Claude 等客户端授权后能检索、新建、改写你的文章；写完还能让 AI 审一遍表述。",
        tags: ["MCP", "AI 审稿"],
      },
      {
        icon: "devices",
        kicker: "随处可写",
        title: "在哪都是同一份",
        desc: "网页版和 Mac 客户端共用一个账号，断网照写，联网后自动补同步。",
        tags: ["网页", "Mac", "离线", "云同步"],
      },
    ],
  },

  showcases: {
    editor: {
      id: "editor",
      eyebrow: "编辑器",
      title: "写 Markdown，看到的却是排好版的文章",
      lead: "打开就是一张纸：没有挤满按钮的工具栏，也不用盯着一屏符号。标题、加粗、列表、代码、图片和公式在编辑区里即时渲染，光标移到哪一行，哪一行才露出 Markdown 源码——像 Obsidian、Typora 那样写。",
      points: [
        "即时渲染与「左源码、右预览」分栏两种模式，随时切换",
        "输入 / 唤出斜杠菜单：标题、提示块、表格、待办、代码块、图片和视频",
        "Obsidian 风格的提示块 > [!tip]、YAML frontmatter、脚注、行内与块级公式",
        "成对符号补全、标题折叠，表格里回车和 Tab 都顺手；亮色 / 暗色两套界面",
      ],
      mock: {
        title: "选题清单",
        status: "已保存",
        heading: "下周要写的三个题目",
        body: "选题的标准只有一个：",
        strong: "我自己真的想读",
        quote: "先写给一个具体的人，再写给所有人。",
        items: ["本地优先到底解决了什么", "我的周报模板"],
      },
    },
    links: {
      id: "links",
      eyebrow: "双链与文库",
      title: "用 [[双链]] 把零散的笔记连成一张网",
      lead: "输入 [[ 就会按标题补全文库里的文章，选中即插入链接，点一下跳过去。链接按标题解析，和 Obsidian 一样，导出成 .md 换个工具也照样认得。给文章改名时，所有指向它的 [[旧标题]] 会一起改成新标题，不会留下断链。",
      points: [
        "[[ 触发标题补全，支持 [[标题|别名]] 的写法",
        "改名时自动更新其他文章里的引用",
        "多级文件夹树，文章和文件夹都能拖着移动",
        "全局搜索、右键菜单，删掉的文章可以从回收站捞回来",
      ],
      mock: {
        query: "卡片",
        suggestions: [
          { title: "卡片笔记法", folder: "读书笔记" },
          { title: "卡片盒里的选题", folder: "写作" },
          { title: "做卡片的三个习惯", folder: "读书笔记" },
        ],
        renameFrom: "卡片笔记法",
        renameTo: "卡片笔记写作法",
        renameNote: "已更新 3 篇文章里的链接",
      },
    },
    tasks: {
      id: "tasks",
      eyebrow: "待办与今天",
      title: "待办写在正文里，「今天」帮你收拢",
      lead: "在任意文章里写 - [ ] 就是一条待办，行尾加 @明天、@10月20日 或一段日期范围就有了截止日，加 @每天 就是每日重复。整个文库里带日期的待办会自动汇总进侧栏的「今天」：今天该做的、即将到来的、最近在写的文章，一页看全。",
      points: [
        "日期标签写在正文里，导出、同步、换设备都跟着文章走",
        "支持 @今天 / @明天、@10/20、@2026-10-20 和 @起~止 范围",
        "@每天 的重复待办，勾掉当天只记一次完成",
        "在「今天」里勾选，会改回原文那一行",
      ],
      mock: {
        title: "今天",
        date: "10 月 19 日 周一",
        groups: [
          {
            label: "今天",
            items: [
              { text: "晨间写作 500 字", doc: "写作工作流", tag: "每天" },
              { text: "回复编辑的修改意见", doc: "选题清单", done: true },
            ],
          },
          {
            label: "即将到来",
            items: [
              { text: "写完第三章初稿", doc: "写作工作流", tag: "明天" },
              { text: "交季度总结", doc: "周报", tag: "10月24日" },
            ],
          },
        ],
        source: "- [ ] 写完第三章初稿 @明天",
      },
    },
    sync: {
      id: "sync",
      eyebrow: "本地与云端",
      title: "放在自己的文件夹里，或者交给云端同步",
      lead: "不登录时，文章存在这台设备上；在 Chrome、Edge 里还可以直接打开电脑上的一个文件夹当文库，每篇就是一个 .md 文件，用别的编辑器打开也一样。登录后文章、文件夹和版本历史同步到云端，网页版、Mac 客户端、换台电脑都是同一份；断网时照写，联网后自动补同步。",
      points: [
        "本地文件夹模式需要 Chromium 内核浏览器，文章只存在这个文件夹里，不上云",
        "登录后云端为主，本机保留离线镜像，断网照常打开和编辑",
        "版本历史：自动快照加手动存档，逐行对比差异，一键回滚",
        "回滚前先自动备份当前稿，不怕点错",
      ],
      mock: {
        localTitle: "本地文件夹",
        localPath: "~/Documents/Notes",
        localFiles: ["写作工作流.md", "选题清单.md", "读书笔记/"],
        localNote: "用任何编辑器打开都是纯文本",
        cloudTitle: "云端同步",
        cloudLines: ["网页版 · 已同步", "Mac 客户端 · 已同步", "离线时改动先存本机"],
        historyTitle: "版本历史",
        versions: [
          { label: "当前", time: "刚刚" },
          { label: "自动快照", time: "今天 09:41" },
          { label: "手动存档 · 初稿", time: "昨天 22:10" },
        ],
        diffRemoved: "所有草稿都存在一个文件里。",
        diffAdded: "所有草稿都是纯文本 Markdown。",
        restore: "回滚到此版本",
      },
    },
    ai: {
      id: "ai",
      eyebrow: "AI",
      title: "AI 能读写你的文库，也能帮你把关表述",
      lead: "xEdit 内置 MCP Server，走自托管的 OAuth 2.1 授权。在 Claude 这类 AI 客户端里添加 xEdit 并授权后，它就能列出、检索、新建、修改你的文章，读写图片库；授权随时可以在设置里撤销。写完还可以点「审核」，让 AI 通读全文、挑出病句和啰嗦，意见直接标在句子上。",
      badge: "审稿内测中",
      points: [
        "MCP 支持动态客户端注册与 PKCE，标准 AI 客户端都能接",
        "AI 只在你授权的账号范围内读写，可在设置里随时撤销",
        "表述审核：病句、啰嗦、用词不当、逻辑跳跃，附修改建议",
        "一键采纳或忽略，⌘Z 可撤销；每次审核都有记录可回看",
      ],
      mock: {
        clientName: "Claude",
        prompt: "把我这周的读书笔记整理成一篇周报，存进「周报」文件夹",
        toolCalls: ["search_documents · 读书笔记", "get_document × 3", "create_document · 周报"],
        reply: "已新建《第 42 周读书周报》，汇总了 3 篇笔记的要点。",
        reviewTag: "表述",
        reviewQuote: "进行了一个全面的优化",
        reviewAdvice: "「进行了一个……的优化」是冗余句式，直接用动词更利落。",
        reviewFix: "全面优化了",
        accept: "采纳",
        ignore: "忽略",
      },
    },
    share: {
      id: "share",
      eyebrow: "分享与导出",
      title: "发个链接收意见，写完导出成任何格式",
      lead: "每篇文章都能生成分享链接，读者不用注册，打开就能读，还能选中文字、图片或视频写批注，你在分享页里直接回复。写完的稿子可以导出 Markdown、HTML、PDF、长图 PNG 和 Word 文档，Word 保留标题层级、列表、表格和图片，能直接导入飞书。",
      points: [
        "批注可以随时关掉，读者看到的正文会更宽",
        "分享链接随时可以手动关闭",
        "Word 导出保留结构，适合导入飞书等在线文档",
        "导出 Markdown 就是你写的原文，带走毫无负担",
      ],
      mock: {
        url: "xedit.me/s/7Kq2",
        excerpt: "所有草稿都是纯文本 Markdown，",
        highlighted: "换任何工具都能打开",
        comment: { author: "林", text: "这里可以举个具体的例子吗？" },
        reply: { author: "作者", text: "好，补一段迁移的经历。" },
        exportLabel: "导出",
        formats: ["Markdown", "HTML", "PDF", "长图 PNG", "Word"],
      },
    },
  },

  features: {
    eyebrow: "全部功能",
    title: "写作、整理、同步、AI，一个编辑器里都齐了",
    note: "下面每一项都是现在就能用的功能；没有的（比如数据库、关系图谱）我们不写。",
    groups: [
      {
        band: "写作",
        note: "写的时候不被工具打断",
        items: [
          {
            icon: "pen",
            title: "即时渲染 Markdown",
            desc: "类 Obsidian 的 Live Preview，光标所在行才露出源码；也能切回左源码右预览的分栏。",
          },
          {
            icon: "slash",
            title: "斜杠命令",
            desc: "输入 / 唤出菜单，支持中文、拼音和英文检索，标题、表格、列表、图片一键插入。",
          },
          {
            icon: "callout",
            title: "提示块",
            desc: "Obsidian 风格的 > [!tip]、> [!warning] 等近十种类型，编辑区里直接渲染成彩色块。",
          },
          {
            icon: "frontmatter",
            title: "Frontmatter 与脚注",
            desc: "YAML frontmatter 单独渲染成属性区，脚注、标题折叠、成对符号补全都已就绪。",
          },
          {
            icon: "sigma",
            title: "数学公式与代码",
            desc: "行内与块级 LaTeX 公式由 MathJax 渲染，代码块带语法高亮。",
          },
          {
            icon: "image",
            title: "图片与视频",
            desc: "登录后截图直接粘贴、文件直接拖入，自动上传并就地插入，图片库统一管理。",
          },
        ],
      },
      {
        band: "整理",
        note: "笔记多了也找得到",
        items: [
          {
            icon: "link",
            title: "[[双链]]",
            desc: "按标题互相引用，输入 [[ 自动补全；改名时其他文章里的链接一起更新。",
          },
          {
            icon: "tasks",
            title: "待办与「今天」",
            desc: "正文里的 - [ ] 加上 @明天、@每天 等标签，自动汇总成今天和即将到来的待办。",
          },
          {
            icon: "folder",
            title: "文件夹树与回收站",
            desc: "多级文件夹，文章和文件夹都能拖拽移动，右键菜单，删了还能从回收站恢复。",
          },
          {
            icon: "search",
            title: "全局搜索",
            desc: "⌘O 快速切换文章，按标题和正文搜索整个文库。",
          },
        ],
      },
      {
        band: "同步与协作",
        note: "文章在哪都在",
        items: [
          {
            icon: "vault",
            title: "本地文件夹当文库",
            desc: "Chrome、Edge 里可以打开电脑上的文件夹，每篇文章就是一个 .md 文件。",
          },
          {
            icon: "cloud",
            title: "云端同步",
            desc: "登录后文章、文件夹、版本和图片存到云端，网页版、Mac 客户端都是同一份。",
          },
          {
            icon: "offline",
            title: "离线可用",
            desc: "不登录也能写；登录状态下断网照写，改动落本机，联网自动补同步。",
          },
          {
            icon: "history",
            title: "版本历史与回滚",
            desc: "自动快照加手动存档，逐行对比差异，一键回滚，回滚前自动备份现稿。",
          },
          {
            icon: "share",
            title: "分享链接与批注",
            desc: "读者免登录阅读，选中文字、图片或视频就能批注，你可以直接回复。",
          },
          {
            icon: "export",
            title: "五种导出格式",
            desc: "Markdown、HTML、PDF、长图 PNG，以及保留完整结构、可导入飞书的 Word。",
          },
          {
            icon: "palette",
            title: "一键复制到公众号",
            desc: "13 套排版主题，复制时样式内联到每个标签，粘贴进公众号、知乎编辑器不走样。",
          },
        ],
      },
      {
        band: "AI",
        note: "让 AI 帮忙，但内容由你做主",
        items: [
          {
            icon: "plug",
            title: "MCP 接入 AI 客户端",
            desc: "内置 MCP Server 与 OAuth 2.1 授权，Claude 等客户端可以检索、新建、改写你的文章与图片。",
          },
          {
            icon: "ai",
            title: "AI 表述审核（内测）",
            desc: "通读全文挑出病句、啰嗦和逻辑跳跃，意见标在原文句子上，一键采纳或忽略。",
          },
        ],
      },
    ],
  },

  ...zhPlans,

  mac: {
    eyebrow: "桌面端",
    title: "Mac 客户端，写作独占一扇窗",
    note: "和网页版同一个账号、同一份数据，多的是属于桌面应用的顺手：登录一次就一直在，原生菜单与快捷键，断网也照写。",
    bullets: [
      "登录态持久保存，重启不用重新登录",
      "⌘N 新建文章、⇧⌘H 回工作台、⌘ +/- 缩放",
      "原生菜单栏与窗口尺寸记忆，单实例运行",
      "断网自动切离线壳，联网后继续同步",
    ],
    cta: "获取 Mac 客户端",
    requirement: "macOS 12+ · Apple Silicon",
    footnote: "安装包未做代码签名，首次打开请在「访达」里右键点图标选「打开」。Windows 暂无独立客户端，网页版功能完全一致。",
    window: {
      folders: ["今天", "读书笔记", "写作", "周报", "图片库"],
      docs: [
        { title: "写作工作流", meta: "1,286 字 · 今天" },
        { title: "选题清单", meta: "642 字 · 昨天" },
        { title: "第 42 周读书周报", meta: "1,905 字 · 3 天前" },
      ],
      keys: ["⌘N 新建", "⇧⌘H 工作台", "⌘+ 放大"],
    },
  },

  faq: zhFaq,

  cta: {
    title: "下一篇笔记，从这里开始写",
    note: "不用注册，打开就能写；写顺手了再登录，文章自动上云。",
  },

  footer: {
    blurb: "即时渲染 · 双链 · 待办 · 本地文件夹或云同步 · MCP",
    navAria: "页脚导航",
    links: [
      { href: "#editor", label: "Markdown 编辑器" },
      { href: "#links", label: "双链笔记" },
      { href: "#tasks", label: "待办与今天" },
      { href: "#sync", label: "本地与云端" },
      { href: "#ai", label: "AI 与 MCP" },
      { href: "#features", label: "全部功能" },
      { href: "#free", label: "免费范围" },
      { href: "#compare", label: "对比 Obsidian / Notion" },
      { href: "/themes", label: "公众号排版主题" },
      { href: "#desktop", label: "Mac 客户端" },
      { href: "/changelog", label: "更新日志" },
      { href: "#faq", label: "常见问题" },
    ],
    github: "GitHub",
    feedback: "反馈与合作",
    contactLead: "免费、开源的本地优先 Markdown 写作工具 · 联系我们：",
  },

  seo: {
    title: `${SITE_NAME} · 免费开源的 Markdown 编辑器，轻量的 Notion / Obsidian 替代`,
    description: SITE_DESCRIPTION,
    keywords: SITE_KEYWORDS,
  },
  jsonLd: {
    description: SITE_DESCRIPTION,
    appSubCategory: "Markdown 编辑器与笔记",
    priceCurrency: "CNY",
  },
};
