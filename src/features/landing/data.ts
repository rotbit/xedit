import {
  ClipboardCheck,
  Cloud,
  Code2,
  FileDown,
  Flame,
  FolderTree,
  History,
  ImageUp,
  PenLine,
  Palette,
  Plug,
  ShieldCheck,
  Sigma,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

export interface FeatureGroup {
  /** 栏目名，落地页里是 h3 */
  band: string;
  note: string;
  items: Feature[];
}

/**
 * 能力清单，按用户心智分三段：先解决「发出去」，再解决「写得顺」，
 * 最后是「不丢、能协作」。每条描述都写清做法而不是形容词，便于搜索引擎理解。
 */
export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    band: "排版与发布",
    note: "把 Markdown 变成能直接发的成稿",
    items: [
      {
        icon: ClipboardCheck,
        title: "一键复制，样式不丢",
        desc: "复制前把主题样式逐条内联到每个标签上，公众号后台、知乎编辑器直接粘贴，标题、引用、代码、表格全都保持原样。",
      },
      {
        icon: Palette,
        title: "13 套排版主题",
        desc: "经典黑、微信绿、科技蓝、水墨、杂志风……每套都标注了适用的内容类型，缩略图即见即所得，点一下就换。",
      },
      {
        icon: Code2,
        title: "自定义 CSS 叠加",
        desc: "在主题之上再写一层自己的 CSS，字号、行距、配色随意改，复制时同样会被内联进正文。",
      },
      {
        icon: Sigma,
        title: "数学公式转 SVG",
        desc: "行内与块级 LaTeX 公式由 MathJax 渲染成 SVG 再复制，公众号不支持 MathML 也照样不变形。",
      },
      {
        icon: FileDown,
        title: "四种导出格式",
        desc: "除了复制，还能导出 Markdown 源文件、独立 HTML、打印版 PDF，以及整篇文章的长图 PNG。",
      },
    ],
  },
  {
    band: "写作与素材",
    note: "写的时候不被工具打断",
    items: [
      {
        icon: PenLine,
        title: "即时渲染编辑器",
        desc: "类 Obsidian 的 Live Preview：标题、加粗、代码、图片在编辑区里直接呈现排版，也可以随时切回左右分栏对照。",
      },
      {
        icon: ImageUp,
        title: "图片自动进图床",
        desc: "截图直接粘贴、文件直接拖进来，自动上传到你自己的阿里云 OSS 并就地插入链接，素材库里可以统一管理。",
      },
      {
        icon: History,
        title: "版本历史与回滚",
        desc: "自动快照加手动存档，点开任一版本即可看到与当前稿的逐行差异，一键回滚，回滚前还会自动备份现稿。",
      },
      {
        icon: FolderTree,
        title: "分类、拖拽与回收站",
        desc: "多级分类树，文章和分类都能拖着移动，全局搜索、右键菜单、删了还能从回收站捞回来。",
      },
      {
        icon: Flame,
        title: "写作统计与养成",
        desc: "热力图、趋势曲线、每日目标，累计字数还会喂养一只会进化的墨灵——让持续更新这件事有点盼头。",
      },
    ],
  },
  {
    band: "智能与同步",
    note: "文章在哪都在，也能交给 AI 打理",
    items: [
      {
        icon: ShieldCheck,
        title: "AI 公众号内容审查",
        desc: "按《微信公众平台运营规范》、推荐加热机制与广告法逐项体检：标题党、绝对化违禁词、合规风险，发之前先过一遍。",
      },
      {
        icon: Plug,
        title: "MCP 接入 AI 客户端",
        desc: "内置 MCP Server 与自建 OAuth 2.1 授权，Claude 等客户端授权后可以直接列出、检索、新建、改写你的文章与图床。",
      },
      {
        icon: Cloud,
        title: "多端云端同步",
        desc: "登录后文章、分类、版本、素材全部存到云端，网页版、Mac 客户端、换台电脑打开都是同一份。",
      },
      {
        icon: WifiOff,
        title: "本地优先，离线可用",
        desc: "不登录也能用全部排版功能，文章存在本设备；登录状态下断网照写，改动落本地镜像，联网自动补同步。",
      },
    ],
  },
];

export interface Step {
  num: string;
  title: string;
  desc: string;
}

export const STEPS: Step[] = [
  {
    num: "01",
    title: "写 Markdown",
    desc: "左手源码右手预览，或者用即时渲染在一个窗口里写完。图片拖进来自动上传。",
  },
  {
    num: "02",
    title: "挑一套主题",
    desc: "13 套主题即点即换，右侧预览就是公众号里的最终效果，不满意还能叠自定义 CSS。",
  },
  {
    num: "03",
    title: "一键复制发布",
    desc: "点「复制到公众号」，进后台粘贴，图文消息里的样子和预览里一模一样。",
  },
];

export const MAC_FEATURES: string[] = [
  "登录态持久保存，重启不用重新登录",
  "⌘N 新建文章、⇧⌘H 回工作台、⌘ +/- 缩放",
  "原生菜单栏与窗口尺寸记忆，单实例运行",
  "断网自动切离线壳，联网后继续同步",
  "服务端更新即时生效，不必频繁升级客户端",
];

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * 常见问题：既回答真实疑问，也承载长尾检索意图。
 * 答案是纯文本（不含标签），同一份会喂给 FAQPage 结构化数据。
 */
export const FAQ: FaqItem[] = [
  {
    q: "xEdit 是免费的吗？必须注册才能用吗？",
    a: "免费，而且打开就能写。不登录时全部排版功能都可用，文章保存在你自己的浏览器里；只有需要多端同步、云端版本历史和图床时才需要登录，用 GitHub、Google 或邮箱密码都可以。",
  },
  {
    q: "怎么把 Markdown 排版成微信公众号文章？",
    a: "在左边写 Markdown，右边会实时渲染出公众号里的样子；选一套喜欢的排版主题，然后点「复制到公众号」，打开公众号后台的图文编辑器直接粘贴即可，不需要任何插件或浏览器扩展。",
  },
  {
    q: "粘贴到公众号后台，样式会不会丢？",
    a: "不会。公众号编辑器会剥掉外部样式表，所以 xEdit 在复制前把主题里的每条样式都内联写进对应标签的 style 属性，并且主题一律不依赖伪元素——标题装饰、引用块、代码块背景这些都用真实元素实现，粘贴过去原样保留。",
  },
  {
    q: "有哪些排版主题？可以自己改样式吗？",
    a: "内置 13 套：经典黑、微信绿、科技蓝、蓝莹、橙心、蔷薇紫、水墨、绛红、青竹、杂志风、靛夜、樱粉、极简，覆盖技术、职场、生活、情感、国风、深度评论等场景。代码块另有 6 套高亮配色。此外还能写自定义 CSS 叠加在主题之上，复制时一并内联。",
  },
  {
    q: "数学公式和代码块在公众号里能正常显示吗？",
    a: "可以。公式用 MathJax 渲染成 SVG 后再复制，公众号不支持 MathML 也不会变形；代码块会带上高亮配色和背景，可选 Mac 窗口样式的三个圆点装饰。",
  },
  {
    q: "文章存在哪里？换台电脑还能看到吗？",
    a: "未登录时存在当前浏览器的本地存储里，只在这台设备可见。登录后文章、分类、版本历史和图片素材都会同步到云端，换设备或打开 Mac 客户端登录同一账号即可看到全部内容；断网时改动先落本地镜像，联网后自动补传。",
  },
  {
    q: "有 Mac 客户端吗？Windows 呢？",
    a: "有 Mac 客户端，支持 Apple Silicon 的 macOS 12 及以上，提供登录态持久化、原生菜单与快捷键、离线提示等桌面体验，数据与网页版完全同步。安装包正在准备对外发布，可以先到 GitHub 仓库关注进展。Windows 暂时没有独立客户端，但网页版在 Windows 上功能完全一致。",
  },
  {
    q: "除了公众号，还能发到别的平台吗？",
    a: "可以。除了「复制到公众号」，还有针对知乎优化的复制模式；也能导出 HTML、Markdown、PDF 和长图 PNG，用于博客、掘金、小红书等其他渠道。",
  },
  {
    q: "AI 内容审查会读到我的文章吗？密钥安全吗？",
    a: "内容审查用的是你自己的 AI 平台密钥，只有你主动点审查时才会把该篇文章发给你选定的平台。密钥在服务端用 AES-256-GCM 加密后入库，按账号隔离，页面上不回显明文。不填密钥不影响其他任何功能。",
  },
  {
    q: "可以让 Claude 这类 AI 直接管理我的文章库吗？",
    a: "可以。xEdit 内置 MCP Server，走自托管的 OAuth 2.1 授权（支持动态客户端注册与 PKCE）。在 AI 客户端里添加 xEdit 后完成授权，它就能列出、检索、新建、修改、删除你的文档，以及读写图床里的图片；授权随时可以在设置里撤销。",
  },
];
