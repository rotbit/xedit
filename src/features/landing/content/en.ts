import { SITE_NAME } from "@/lib/site";
import { enChrome } from "./enChrome";
import { enPlans } from "./enPlans";
import { enFaq } from "./enFaq";
import type { LandingCopy } from "./types";

/**
 * English landing copy, adapted from zh.ts (the source of truth).
 * Same honesty rule: every claim must match the shipped code; when zh.ts changes, update this file too.
 * Task tags use the forms the app parses in English (src/lib/todos/dates.ts): @today, @tomorrow, @daily, @10/20, @2026-10-20, @a~b.
 */
export const en: LandingCopy = {
  lang: "en",
  chrome: enChrome,

  hero: {
    badge: "Free · MIT open source",
    titleLine1: "Local-first like Obsidian.",
    titleLine2Before: "As ",
    titleMark: "easy to write in",
    titleLine2After: " as Notion.",
    sub: "A live-preview Markdown editor. [[Wiki links]] connect your notes, slash commands insert any block, and to-dos roll up into Today. Keep your notes in a local folder or sync them to the cloud, and let AI read and write them over MCP.",
    macCta: "Get the Mac app",
    githubCta: "View on GitHub",
    note: "No sign-up, just start writing. Notes stay on this device, and sync to the cloud once you log in.",
    stats: [
      { value: "$0", label: "for every writing feature" },
      { value: "MIT", label: "open-source license" },
      { value: "MCP", label: "built-in AI access" },
    ],
    visualLabel: "PREVIEW",
    visualCaption: "What you write is what you see: links, callouts and to-dos render right in the editor",
  },

  mockup: {
    windowTitle: "Writing workflow",
    syncStatus: "Synced",
    searchPlaceholder: "Search",
    today: "Today",
    todayCount: "3",
    foldersLabel: "Folders",
    folders: [
      { name: "Reading notes" },
      { name: "Writing", docs: ["Writing workflow", "Topic ideas"] },
      { name: "Weekly reviews" },
    ],
    activeDoc: "Writing workflow",
    breadcrumb: "Writing",
    docTitle: "Writing workflow",
    paraBefore: "Every draft is plain-text Markdown, and related ideas link to each other, like ",
    wikiLink: "Zettelkasten method",
    paraAfter: ". Rename a note and every link pointing to it updates too.",
    calloutBadge: "Tip",
    calloutText: "Press / for the command menu. Headings, tables and callouts, no syntax to memorize.",
    tasksHeading: "This week",
    tasks: [
      { text: "Sort last week's reading highlights", done: true },
      { text: "Finish the chapter 3 draft", due: "tomorrow" },
      { text: "Morning pages, 500 words", due: "daily" },
    ],
    slashQuery: "/",
    slashItems: [
      { icon: "h2", label: "Heading 2", hint: "##" },
      { icon: "callout", label: "Callout", hint: "> [!tip]" },
      { icon: "todo", label: "To-do list", hint: "- [ ]" },
      { icon: "table", label: "Table", hint: "|" },
      { icon: "code", label: "Code block", hint: "```" },
      { icon: "image", label: "Image", hint: "![]" },
    ],
    wordCount: "1,286 words",
  },

  pillars: {
    srTitle: "Four ideas behind xEdit: local-first, easy to write in, AI-native, write anywhere",
    items: [
      {
        icon: "obsidian",
        kicker: "Like Obsidian",
        title: "Plain text you own",
        desc: "Every note is standard Markdown, and [[wiki links]] reference other notes by title. You can even use a folder on your computer as your vault.",
        tags: ["Markdown", "Wiki links", "Local folders"],
      },
      {
        icon: "notion",
        kicker: "Like Notion",
        title: "Write without the syntax",
        desc: "Type / for the command menu to drop in callouts, tables and to-dos. Drag notes and folders to keep things organized.",
        tags: ["Slash commands", "Callouts", "Drag and drop"],
      },
      {
        icon: "ai",
        kicker: "AI-native",
        title: "Bring AI into your vault",
        desc: "A built-in MCP server lets Claude and other clients search, create and edit your notes once you authorize them. AI can also review your wording when you're done.",
        tags: ["MCP", "AI review"],
      },
      {
        icon: "devices",
        kicker: "Write anywhere",
        title: "One copy, everywhere",
        desc: "The web app and the Mac app share one account. Keep writing offline, and changes sync when you're back online.",
        tags: ["Web", "Mac", "Offline", "Cloud sync"],
      },
    ],
  },

  showcases: {
    editor: {
      id: "editor",
      eyebrow: "Editor",
      title: "Write Markdown, see a formatted page",
      lead: "It opens like a blank sheet of paper: no toolbar crammed with buttons, no screen full of symbols. Headings, bold, lists, code, images and math render as you type, and only the line under your cursor shows its Markdown source, just like writing in Obsidian or Typora.",
      points: [
        "Switch anytime between live preview and a split view with source on the left, preview on the right",
        "Type / for the slash menu: headings, callouts, tables, to-dos, code blocks, images and video",
        "Obsidian-style > [!tip] callouts, YAML frontmatter, footnotes, inline and block math",
        "Auto-paired brackets, foldable headings, Enter and Tab that behave in tables; light and dark themes",
      ],
      mock: {
        title: "Topic ideas",
        status: "Saved",
        heading: "Three topics for next week",
        body: "One rule for picking a topic: ",
        strong: "I'd actually want to read it",
        quote: "Write for one specific person first, then for everyone.",
        items: ["What local-first actually solves", "My weekly review template"],
      },
    },
    links: {
      id: "links",
      eyebrow: "Links and vault",
      title: "Turn scattered notes into a web with [[wiki links]]",
      lead: "Type [[ and xEdit suggests notes from your vault by title. Pick one to insert the link, click it to jump there. Links resolve by title, just like Obsidian, so exported .md files still work in other tools. Rename a note and every [[old title]] pointing to it changes to the new one, so nothing breaks.",
      points: [
        "[[ triggers title suggestions, with [[title|alias]] support",
        "Renaming a note updates links to it in other notes",
        "Nested folders, with drag and drop for notes and folders",
        "Global search, right-click menus, and a trash you can restore from",
      ],
      mock: {
        query: "Zettel",
        suggestions: [
          { title: "Zettelkasten method", folder: "Reading notes" },
          { title: "Topics from my Zettelkasten", folder: "Writing" },
          { title: "Three Zettelkasten habits", folder: "Reading notes" },
        ],
        renameFrom: "Zettelkasten method",
        renameTo: "Writing with a Zettelkasten",
        renameNote: "Updated links in 3 notes",
      },
    },
    tasks: {
      id: "tasks",
      eyebrow: "Tasks and Today",
      title: "Write to-dos in your notes. Today gathers them up.",
      lead: "Type - [ ] anywhere to make a to-do. End the line with @tomorrow, @10/20 or a date range to set a due date, or @daily to repeat it every day. Dated to-dos from across your vault roll up into Today in the sidebar: what's due today, what's coming up, and what you've been writing, all on one page.",
      points: [
        "Date tags live in the note itself, so they travel with it through export, sync and new devices",
        "Supports @today / @tomorrow, @10/20, @2026-10-20 and @start~end ranges",
        "@daily repeating to-dos: checking one off counts only for that day",
        "Check a to-do in Today and the original line in your note updates",
      ],
      mock: {
        title: "Today",
        date: "Monday, October 19",
        groups: [
          {
            label: "Today",
            items: [
              { text: "Morning pages, 500 words", doc: "Writing workflow", tag: "Daily" },
              { text: "Reply to my editor's notes", doc: "Topic ideas", done: true },
            ],
          },
          {
            label: "Upcoming",
            items: [
              { text: "Finish the chapter 3 draft", doc: "Writing workflow", tag: "Tomorrow" },
              { text: "Send the quarterly review", doc: "Weekly reviews", tag: "Oct 24" },
            ],
          },
        ],
        source: "- [ ] Finish the chapter 3 draft @tomorrow",
      },
    },
    sync: {
      id: "sync",
      eyebrow: "Local and cloud",
      title: "Keep notes in your own folder, or let the cloud sync them",
      lead: "Until you log in, notes stay on this device. In Chrome or Edge you can also open a folder on your computer as your vault: every note is a .md file that opens the same in any other editor. Log in and your notes, folders and version history sync to the cloud, so the web app, the Mac app and any other computer share one copy. Keep writing offline; changes sync when you reconnect.",
      points: [
        "Local folder mode needs a Chromium-based browser, and notes stay in that folder only, never in the cloud",
        "Once you log in, the cloud is the source of truth and this device keeps an offline copy you can open and edit",
        "Version history: automatic snapshots plus manual saves, line-by-line diffs, one-click restore",
        "The current draft is backed up before every restore, so a wrong click costs nothing",
      ],
      mock: {
        localTitle: "Local folder",
        localPath: "~/Documents/Notes",
        localFiles: ["Writing workflow.md", "Topic ideas.md", "Reading notes/"],
        localNote: "Plain text in any editor",
        cloudTitle: "Cloud sync",
        cloudLines: ["Web · Synced", "Mac app · Synced", "Offline edits are saved on this device first"],
        historyTitle: "Version history",
        versions: [
          { label: "Current", time: "Just now" },
          { label: "Auto snapshot", time: "Today 09:41" },
          { label: "Manual save · First draft", time: "Yesterday 22:10" },
        ],
        diffRemoved: "All my drafts live in one big file.",
        diffAdded: "Every draft is plain-text Markdown.",
        restore: "Restore this version",
      },
    },
    ai: {
      id: "ai",
      eyebrow: "AI",
      title: "AI that works in your vault and checks your wording",
      lead: "xEdit has a built-in MCP server with self-hosted OAuth 2.1 authorization. Add xEdit to an AI client like Claude, authorize it, and it can list, search, create and edit your notes and read and write your image library. You can revoke access in Settings at any time. When you're done writing, click Review and AI reads the whole piece, flags awkward and wordy sentences, and pins its notes right on them.",
      badge: "Review in beta",
      points: [
        "MCP supports dynamic client registration and PKCE, so standard AI clients can connect",
        "AI only reads and writes within the account you authorized, and you can revoke it in Settings anytime",
        "Wording review: awkward sentences, wordiness, wrong word choice, logic gaps, with suggested fixes",
        "Accept or ignore in one click, undo with ⌘Z; every review is saved so you can look back",
      ],
      mock: {
        clientName: "Claude",
        prompt: "Turn this week's reading notes into a weekly review and save it in my Weekly reviews folder",
        toolCalls: ["search_documents · Reading notes", "get_document × 3", "create_document · Weekly reviews"],
        reply: "Created \"Week 42 reading review\" with the key points from 3 notes.",
        reviewTag: "Wording",
        reviewQuote: "performed a comprehensive optimization of",
        reviewAdvice: "\"Performed an optimization of\" hides the verb inside a noun. Using the verb directly is tighter.",
        reviewFix: "fully optimized",
        accept: "Accept",
        ignore: "Ignore",
      },
    },
    share: {
      id: "share",
      eyebrow: "Share and export",
      title: "Share a link for feedback, export to any format",
      lead: "Any note can get a share link. Readers open it and read without signing up, and they can select text, images or video to leave comments that you reply to right on the shared page. When a draft is done, export it as Markdown, HTML, PDF, a long PNG image or a Word document. Word exports keep heading levels, lists, tables and images, and import straight into Feishu.",
      points: [
        "Turn comments off anytime to give readers a wider page",
        "Turn off a share link manually whenever you want",
        "Word exports keep their structure, ready for Feishu and other online docs",
        "Markdown export is exactly what you wrote, so you can take it anywhere",
      ],
      mock: {
        url: "xedit.me/s/7Kq2",
        excerpt: "Every draft is plain-text Markdown, ",
        highlighted: "so any tool can open it",
        comment: { author: "Maya", text: "Could you add a concrete example here?" },
        reply: { author: "Author", text: "Sure, I'll add a paragraph about how I migrated." },
        exportLabel: "Export",
        formats: ["Markdown", "HTML", "PDF", "Long PNG", "Word"],
      },
    },
  },

  features: {
    eyebrow: "All features",
    title: "Writing, organizing, sync and AI, all in one editor",
    note: "Everything below works today. What we don't have yet, like databases or a graph view, isn't listed.",
    groups: [
      {
        band: "Writing",
        note: "Tools that stay out of your way",
        items: [
          {
            icon: "pen",
            title: "Live-preview Markdown",
            desc: "Obsidian-style live preview that shows source only on the cursor's line, or switch to a split source/preview view.",
          },
          {
            icon: "slash",
            title: "Slash commands",
            desc: "Type / for the menu, searchable in English, Chinese or pinyin. Insert headings, tables, lists and images in one step.",
          },
          {
            icon: "callout",
            title: "Callouts",
            desc: "About ten Obsidian-style types like > [!tip] and > [!warning], rendered as colored blocks right in the editor.",
          },
          {
            icon: "frontmatter",
            title: "Frontmatter and footnotes",
            desc: "YAML frontmatter renders as its own properties panel, plus footnotes, foldable headings and auto-paired brackets.",
          },
          {
            icon: "sigma",
            title: "Math and code",
            desc: "Inline and block LaTeX rendered with MathJax, and code blocks with syntax highlighting.",
          },
          {
            icon: "image",
            title: "Images and video",
            desc: "Once logged in, paste a screenshot or drop a file to upload and insert it in place, all managed in one image library.",
          },
        ],
      },
      {
        band: "Organizing",
        note: "Find things even as notes pile up",
        items: [
          {
            icon: "link",
            title: "[[Wiki links]]",
            desc: "Link notes by title with [[ autocomplete. Rename a note and links to it in other notes update too.",
          },
          {
            icon: "tasks",
            title: "Tasks and Today",
            desc: "Add tags like @tomorrow or @daily to a - [ ] line and it rolls up into today's and upcoming to-dos.",
          },
          {
            icon: "folder",
            title: "Folders and trash",
            desc: "Nested folders, drag and drop for notes and folders, right-click menus, and a trash you can restore from.",
          },
          {
            icon: "search",
            title: "Global search",
            desc: "Jump between notes with ⌘O, and search your whole vault by title and content.",
          },
        ],
      },
      {
        band: "Sync and sharing",
        note: "Your notes, wherever you are",
        items: [
          {
            icon: "vault",
            title: "Local folder as vault",
            desc: "In Chrome or Edge, open a folder on your computer. Every note is a .md file.",
          },
          {
            icon: "cloud",
            title: "Cloud sync",
            desc: "Log in to store notes, folders, versions and images in the cloud, one copy across the web and Mac apps.",
          },
          {
            icon: "offline",
            title: "Works offline",
            desc: "Write without an account. When logged in, keep writing offline; changes save locally and sync when you reconnect.",
          },
          {
            icon: "history",
            title: "Version history",
            desc: "Automatic snapshots plus manual saves, line-by-line diffs, one-click restore, with a backup of the current draft first.",
          },
          {
            icon: "share",
            title: "Share links and comments",
            desc: "Readers read without logging in and comment on selected text, images or video. You reply right there.",
          },
          {
            icon: "export",
            title: "Five export formats",
            desc: "Markdown, HTML, PDF, long PNG, and Word with its full structure intact, ready to import into Feishu.",
          },
          {
            icon: "palette",
            title: "Copy to WeChat in one click",
            desc: "13 layout themes, inlined onto every tag at copy time, so pasting into WeChat Official Accounts or Zhihu keeps the styling.",
          },
        ],
      },
      {
        band: "AI",
        note: "AI helps, you decide",
        items: [
          {
            icon: "plug",
            title: "MCP for AI clients",
            desc: "A built-in MCP server with OAuth 2.1 lets Claude and other clients search, create and edit your notes and images.",
          },
          {
            icon: "ai",
            title: "AI wording review (beta)",
            desc: "Reads the whole piece for awkward sentences, wordiness and logic gaps, pins notes on the sentences, accept or ignore in one click.",
          },
        ],
      },
    ],
  },

  ...enPlans,
  mac: {
    eyebrow: "Desktop",
    title: "A Mac app that gives writing its own window",
    note: "Same account and same data as the web app, plus what a desktop app does best: log in once and stay logged in, native menus and shortcuts, and writing that keeps going offline.",
    bullets: [
      "Stays logged in, even after a restart",
      "⌘N for a new note, ⇧⌘H for your workspace, ⌘ +/- to zoom",
      "Native menu bar, remembered window size, single instance",
      "Switches to an offline shell when the network drops, and resumes syncing when it's back",
    ],
    cta: "Get the Mac app",
    requirement: "macOS 12+ · Apple Silicon",
    footnote: "The installer isn't code-signed yet. The first time you open it, right-click the icon in Finder and choose Open. There's no Windows app yet, but the web app has every feature.",
    window: {
      folders: ["Today", "Reading notes", "Writing", "Weekly reviews", "Images"],
      docs: [
        { title: "Writing workflow", meta: "1,286 words · Today" },
        { title: "Topic ideas", meta: "642 words · Yesterday" },
        { title: "Week 42 reading review", meta: "1,905 words · 3 days ago" },
      ],
      keys: ["⌘N New", "⇧⌘H Workspace", "⌘+ Zoom in"],
    },
  },

  faq: enFaq,

  cta: {
    title: "Start your next note here",
    note: "No sign-up, just start writing. Log in when you're ready and your notes move to the cloud.",
  },

  footer: {
    blurb: "Live preview · Wiki links · To-dos · Local folders or cloud sync · MCP",
    navAria: "Footer navigation",
    links: [
      { href: "#editor", label: "Markdown editor" },
      { href: "#links", label: "Wiki links" },
      { href: "#tasks", label: "Tasks and Today" },
      { href: "#sync", label: "Local and cloud" },
      { href: "#ai", label: "AI and MCP" },
      { href: "#features", label: "All features" },
      { href: "#free", label: "What's free" },
      { href: "#compare", label: "vs Obsidian / Notion" },
      { href: "#desktop", label: "Mac app" },
      { href: "/changelog", label: "Changelog" },
      { href: "#faq", label: "FAQ" },
    ],
    github: "GitHub",
    feedback: "Feedback and partnerships",
    contactLead: "A free, open-source, local-first Markdown editor · Contact: ",
  },

  seo: {
    title: `${SITE_NAME} · Free Markdown editor & Notion / Obsidian alternative`,
    description:
      "Free, open-source Markdown editor and lightweight Notion / Obsidian alternative: live preview, [[wiki links]], local .md folders, free cloud sync, MCP for AI.",
    keywords: [
      "free Markdown editor", "Markdown editor", "free Notion alternative", "free Obsidian alternative", "local-first notes", "wiki links",
      "live preview Markdown", "open-source note-taking app", "MCP", "AI writing review", "Mac Markdown app", "xEdit",
    ],
  },
  jsonLd: {
    description:
      "Free, open-source Markdown editor and lightweight Notion / Obsidian alternative: live preview, [[wiki links]], local folders or cloud sync, and MCP for AI.",
    appSubCategory: "Markdown editor and notes",
    priceCurrency: "USD",
  },
};
