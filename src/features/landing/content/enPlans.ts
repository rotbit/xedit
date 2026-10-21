import type { CompareCopy, FreeCopy } from "./types";

/** English copy for the What's free and comparison sections; same facts and sources as zhPlans.ts */
export const enPlans: { free: FreeCopy; compare: CompareCopy } = {
  free: {
    eyebrow: "What's free",
    title: "Exactly what's free, and the real limits",
    note: "xEdit has no paid plan today. The code is MIT-licensed and you can self-host it. Here are the current rules and limits.",
    tiers: [
      {
        label: "No account",
        title: "Open it and write",
        items: [
          "Every editing feature: live preview, slash commands, [[wiki links]], to-dos and Today",
          "Notes stay in this browser, or in a local folder you open as your vault",
          "Export to Markdown, HTML, PDF, long PNG image or Word",
          "One-click copy to WeChat Official Accounts and Zhihu, with 13 layout themes",
          "Image uploads, share links and cloud sync need an account",
        ],
      },
      {
        label: "With an account · free",
        title: "Cloud sync and sharing",
        items: [
          "Notes, folders, version history and images sync to the cloud, shared by the web app and the Mac app",
          "No limit on the number of devices; keep writing offline and it syncs when you reconnect",
          "Images up to 10 MB each, videos up to 100 MB each; every account has a total media storage quota, and once it's full new uploads are blocked while existing files stay",
          "The latest 100 versions of each note are kept; older ones are cleaned up",
          "Share links with reader comments",
        ],
      },
      {
        label: "AI",
        title: "Who pays for what",
        items: [
          "MCP access is free: once authorized, clients like Claude can read and write your cloud notes; the client's own subscription or API usage is between you and that provider",
          "MCP only sees cloud notes, never notes kept in the browser or in a local folder",
          "AI review is in beta, opening account by account, with a daily usage cap",
          "During the beta xEdit pays for the review model, so you don't need your own API key",
        ],
      },
    ],
    storageTitle: "Three ways to store your notes",
    storageLabels: { where: "Where", sync: "Cloud sync", fit: "Best for" },
    storage: [
      {
        name: "In the browser",
        where: "The default without an account: notes live in this browser on this device only, and clearing the site's data deletes them",
        sync: "Uploaded to your cloud account automatically when you log in",
        fit: "Trying xEdit out, or a quick one-off draft",
      },
      {
        name: "Local Markdown folder",
        where: "Without an account, open a folder on your computer in Chrome or Edge; each note is a .md file",
        sync: "Never synced to the cloud, not even after you log in; back it up your own way (cloud drive, Git, etc.)",
        fit: "Keeping files on your own disk and sharing them with other editors",
      },
      {
        name: "Cloud sync",
        where: "With an account the cloud is the source of truth, and this device keeps an offline copy",
        sync: "The same notes on every device; version history, images and share links live here",
        fit: "Switching between the web and the Mac app, or between computers",
      },
    ],
  },

  compare: {
    eyebrow: "Compare",
    title: "xEdit vs Obsidian and Notion: who it's for",
    note: "xEdit is a lightweight Markdown editor for writing and personal notes, not a full replacement for either. This table reflects what ships today; if something's missing, it says so.",
    rowHead: "Capability",
    rows: [
      { label: "Price and source", xedit: "Free, MIT open source", obsidian: "Free for personal use, closed source; official Sync is paid", notion: "Free plan, advanced features paid; closed source" },
      { label: "Storage format", xedit: "Plain-text standard Markdown", obsidian: "Local Markdown files", notion: "Cloud blocks, with Markdown import and export" },
      { label: "Markdown import / export", xedit: ".md export is exactly what you wrote; also HTML, PDF, PNG, Word", obsidian: "The files are already .md", notion: "Supported; complex pages lose some formatting" },
      { label: "Local files", xedit: "Open a local folder (Chrome / Edge); not cloud-synced", obsidian: "Native local vault", notion: "Cloud-first" },
      { label: "Cloud sync", xedit: "Free with an account", obsidian: "Paid official Sync, or bring your own", notion: "Built in" },
      { label: "No install", xedit: "Web app in the browser, plus a Mac app", obsidian: "Desktop or mobile app required", notion: "Web plus apps for each platform" },
      { label: "[[Wiki links]]", xedit: "Yes, with title autocomplete and rename updates", obsidian: "Yes", notion: "Page links and @ mentions" },
      { label: "Backlinks panel", xedit: "Not yet", obsidian: "Yes", notion: "Yes" },
      { label: "Graph view", xedit: "Not yet", obsidian: "Yes", notion: "No" },
      { label: "Databases", xedit: "No, only plain Markdown tables", obsidian: "Via Bases and plugins", notion: "Core feature" },
      { label: "Plugins", xedit: "No plugin system; Obsidian plugins don't work", obsidian: "Large community plugin ecosystem", notion: "Integrations and templates" },
      { label: "Real-time collaboration", xedit: "No; share a link to collect comments", obsidian: "No", notion: "Yes" },
      { label: "AI access", xedit: "Built-in MCP server; authorized AI clients read and write your notes", obsidian: "Through community plugins", notion: "Notion AI and official integrations" },
      { label: "Mobile app", xedit: "Not yet", obsidian: "iOS / Android", notion: "iOS / Android" },
    ],
    fitTitle: "xEdit is a good fit if you",
    fit: [
      "Mostly write articles, reports and reading notes in Markdown and want live preview without building a whole system",
      "Want free cloud sync and a web app that's ready instantly, or no account at all with files in your own folder",
      "Want Claude and other AI clients to search, organize and edit your notes over MCP",
      "Publish to WeChat Official Accounts or Zhihu and want formatting that survives the paste",
    ],
    otherTitle: "Pick Obsidian or Notion instead if you",
    other: [
      "Need databases, board views or real-time team editing: Notion",
      "Rely on a backlinks panel, graph view or community plugins: Obsidian",
      "Take most notes on your phone: both have native apps",
      "Already have an Obsidian vault: xEdit can open the folder and edit its .md files, but plugins, settings and canvases won't carry over",
    ],
    footnote: "Obsidian and Notion details are based on their public feature sets as of October 2026; check their official docs for the latest.",
  },
};
