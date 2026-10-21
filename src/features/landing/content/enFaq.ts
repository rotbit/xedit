import type { LandingCopy } from "./types";

/** English FAQ, split from en.ts to keep it under the size cap. Answers also feed the FAQPage JSON-LD, so plain text only. */
export const enFaq: LandingCopy["faq"] = {
  eyebrow: "FAQ",
  title: "Questions you might have about xEdit",
  noteBefore: "Something else? Open an issue on the GitHub repo, or email us at ",
  noteAfter: ".",
  items: [
    {
      q: "Is xEdit free? Do I need an account?",
      a: "It's free: there's no paid plan today, and the code is open source on GitHub under the MIT license. Just open it and write: every editing feature works without logging in, and your notes are saved on this device. Log in when you want sync across devices, cloud version history, image uploads or share links, which are free too. You can use GitHub, Google, or email and password. Images can be up to 10 MB and videos up to 100 MB each, every account has a total media storage quota, and each note keeps its latest 100 versions; see What's free on this page.",
    },
    {
      q: "How is it different from Obsidian or Notion?",
      a: "Like Obsidian, xEdit stores notes as plain-text Markdown, links them by title with [[wiki links]], and can use a local folder as your vault. Like Notion, it has slash commands, callouts and drag-and-drop organizing. The difference is that it runs in the browser with nothing to install, has cloud sync built in, and lets AI read and write your vault over MCP. xEdit supports [[wiki links]], but it doesn't have a backlinks panel, graph view, databases, plugins, a mobile app or real-time collaboration yet, so if you rely heavily on those, Obsidian or Notion will suit you better. The comparison table on this page goes through it point by point.",
    },
    {
      q: "Where are my notes stored?",
      a: "When you're not logged in, they're stored in this browser and visible only on this device. You can also open a folder on your computer as your vault, where each note is a .md file. Once you log in, notes, folders, version history and images sync to the cloud, and this device keeps an offline copy.",
    },
    {
      q: "Can I use a folder on my computer?",
      a: "Yes. In local mode (not logged in), click \"Open folder as vault\" at the bottom of the sidebar and pick a folder. Each note is a .md file that opens as plain text in any other editor. This relies on the browser's File System Access API, so it currently needs a Chromium-based browser like Chrome or Edge; Safari and Firefox aren't supported yet. In folder mode, notes live only in that folder and don't sync to the cloud.",
    },
    {
      q: "Can I write offline?",
      a: "Yes. When you're not logged in, everything is on this device anyway. When you're logged in and go offline, changes are saved to the local offline copy first and sync when you reconnect. The Mac app switches to an offline shell automatically, so you can keep opening and editing notes.",
    },
    {
      q: "How do wiki links and to-dos work?",
      a: "Type [[ and xEdit suggests notes from your vault by title; pick one to insert the link. When you rename a note, links to it in other notes update too. Type - [ ] in any note to create a to-do, and end the line with a date tag like @tomorrow or @10/20, or with @daily. Dated to-dos roll up into Today in the sidebar.",
    },
    {
      q: "Can an AI like Claude manage my notes directly?",
      a: "Yes. xEdit has a built-in MCP server with self-hosted OAuth 2.1 authorization (supporting dynamic client registration and PKCE). Add xEdit in your AI client and authorize it, and it can list, search, create, edit and delete your cloud notes, and read and write images in your image library. You can revoke access in Settings at any time. MCP access itself is free and only reaches your cloud notes; your AI client's own subscription or API usage is between you and that provider.",
    },
    {
      q: "What does AI review do?",
      a: "When you're done, click Review and AI reads the whole piece, checking for awkward sentences, wordiness, wrong word choices and logic gaps. Each note is pinned to the matching sentence with a suggested fix that you can accept or ignore in one click, and undo with ⌘Z. Reviews are saved automatically. AI review requires an account and is in beta, opening account by account with a daily usage cap. During the beta xEdit pays for the model, so you don't need your own API key.",
    },
    {
      q: "What can I export to? Can I share notes with others?",
      a: "You can export Markdown, HTML, PDF, long PNG images and Word documents. Word exports keep heading levels, lists, tables and images, and import straight into Feishu. Once logged in, any note can get a share link: readers don't need an account, and they can select text, images or video to comment, which you can reply to on the shared page. Comments and links can both be turned off anytime.",
    },
    {
      q: "Is there a Mac app? What about Windows?",
      a: "Yes, there's a Mac app for macOS 12 and later on Apple Silicon. It stays logged in, has native menus and shortcuts, works offline, and syncs fully with the web app. The installer isn't code-signed yet; you can get it from the GitHub repo for now. There's no Windows app yet, but the web app has every feature on Windows.",
    },
  ],
};
