import type { LandingChromeCopy } from "./types";

/**
 * Chinese chrome copy, split from zh.ts so client components (LandingChrome) can default to it
 * without pulling the whole landing dictionary into the client bundle.
 * `#` anchors must match section ids rendered by Landing; change both together or the nav link does nothing.
 */
export const zhChrome: LandingChromeCopy = {
  tagline: "本地优先的 Markdown 写作工具",
  nav: [
    { href: "#editor", label: "编辑器" },
    { href: "#links", label: "双链" },
    { href: "#tasks", label: "待办" },
    { href: "#sync", label: "同步" },
    { href: "#ai", label: "AI" },
    { href: "#desktop", label: "Mac 版" },
    { href: "/changelog", label: "更新日志" },
    { href: "#faq", label: "常见问题" },
  ],
  navAria: "页面导航",
  githubAria: "在 GitHub 上查看 xEdit 源码",
  login: "登录",
  loginOrSignup: "登录 / 注册",
  start: "开始写作",
  langAria: "切换页面语言",
};
