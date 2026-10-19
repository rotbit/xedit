import type { LandingChromeCopy } from "./types";

/** Japanese chrome copy, split from ja.ts the same way zhChrome.ts is. Anchors must match Landing's section ids. */
export const jaChrome: LandingChromeCopy = {
  tagline: "ローカルファーストの Markdown エディタ",
  nav: [
    { href: "#editor", label: "エディタ" },
    { href: "#links", label: "リンク" },
    { href: "#tasks", label: "タスク" },
    { href: "#sync", label: "同期" },
    { href: "#ai", label: "AI" },
    { href: "#desktop", label: "Mac 版" },
    { href: "/changelog", label: "更新履歴" },
    { href: "#faq", label: "よくある質問" },
  ],
  navAria: "ページ内ナビゲーション",
  githubAria: "GitHub で xEdit のソースコードを見る",
  login: "ログイン",
  loginOrSignup: "ログイン / 新規登録",
  start: "書きはじめる",
  langAria: "表示言語を切り替える",
};
