import type { LandingChromeCopy } from "./types";

/**
 * English chrome copy, split from en.ts like zhChrome.ts.
 * `#` anchors must match section ids rendered by Landing.
 */
export const enChrome: LandingChromeCopy = {
  tagline: "Local-first Markdown editor",
  nav: [
    { href: "#editor", label: "Editor" },
    { href: "#links", label: "Links" },
    { href: "#tasks", label: "Tasks" },
    { href: "#sync", label: "Sync" },
    { href: "#ai", label: "AI" },
    { href: "#desktop", label: "Mac app" },
    { href: "/changelog", label: "Changelog" },
    { href: "#faq", label: "FAQ" },
  ],
  navAria: "Page navigation",
  githubAria: "View the xEdit source on GitHub",
  login: "Log in",
  loginOrSignup: "Log in / Sign up",
  start: "Start writing",
  langAria: "Change page language",
};
