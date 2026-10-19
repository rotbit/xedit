/**
 * Shape of one landing-page dictionary. Every user-visible string on the landing page (and its JSON-LD) lives here,
 * so a locale is just another object of this type; icons stay in code and are referenced by id (see components/icons.ts).
 * Answers and descriptions are plain text: several of them also feed structured data, where markup isn't allowed.
 */

/** Icon ids resolved to lucide components in components/icons.ts; add the mapping there when adding one here */
export type LandingIconId =
  | "pen"
  | "slash"
  | "callout"
  | "sigma"
  | "image"
  | "frontmatter"
  | "link"
  | "folder"
  | "tasks"
  | "search"
  | "history"
  | "cloud"
  | "offline"
  | "vault"
  | "share"
  | "export"
  | "ai"
  | "plug"
  | "obsidian"
  | "notion"
  | "devices";

/** Nav entry: `#id` anchors point at section ids on the landing page, anything else is a route */
export interface NavLink {
  href: string;
  label: string;
}

/** Text used by the shared chrome (header and buttons), which /themes and /changelog also render */
export interface LandingChromeCopy {
  /** Short tagline next to the logo */
  tagline: string;
  nav: NavLink[];
  navAria: string;
  githubAria: string;
  /** Compact header button */
  login: string;
  /** Full login button in the closing CTA */
  loginOrSignup: string;
  /** Primary 「开始写作」 button on the localized pages (/en, /ja); the home page's label comes from the workspace */
  start: string;
  /** aria-label of the language switcher */
  langAria: string;
}

export interface HeroStat {
  value: string;
  label: string;
}

export interface HeroCopy {
  badge: string;
  /** Serif first line of the H1 */
  titleLine1: string;
  /** Second line = before + highlighted mark + after */
  titleLine2Before: string;
  titleMark: string;
  titleLine2After: string;
  sub: string;
  macCta: string;
  githubCta: string;
  /** Small line under the CTAs */
  note: string;
  stats: HeroStat[];
  /** Caption above the window mockup */
  visualLabel: string;
  visualCaption: string;
}

/** Sample text inside the hero's app window mockup */
export interface MockupCopy {
  windowTitle: string;
  syncStatus: string;
  searchPlaceholder: string;
  today: string;
  todayCount: string;
  foldersLabel: string;
  folders: { name: string; docs?: string[] }[];
  /** Title of the doc shown as active in the tree (must appear in one folder's docs) */
  activeDoc: string;
  breadcrumb: string;
  docTitle: string;
  /** Paragraph = before + [[link]] + after */
  paraBefore: string;
  wikiLink: string;
  paraAfter: string;
  calloutBadge: string;
  calloutText: string;
  tasksHeading: string;
  tasks: { text: string; done?: boolean; due?: string }[];
  slashQuery: string;
  slashItems: { icon: "h2" | "callout" | "todo" | "table" | "code" | "image"; label: string; hint: string }[];
  wordCount: string;
}

export interface Pillar {
  icon: LandingIconId;
  kicker: string;
  title: string;
  desc: string;
  tags: string[];
}

/** Copy column of a showcase row */
export interface ShowcaseText {
  id: string;
  eyebrow: string;
  badge?: string;
  title: string;
  lead: string;
  points: string[];
}

export interface ShowcasesCopy {
  editor: ShowcaseText & {
    mock: { title: string; status: string; heading: string; body: string; strong: string; quote: string; items: string[] };
  };
  links: ShowcaseText & {
    mock: { query: string; suggestions: { title: string; folder: string }[]; renameFrom: string; renameTo: string; renameNote: string };
  };
  tasks: ShowcaseText & {
    mock: {
      title: string;
      date: string;
      groups: { label: string; items: { text: string; doc: string; done?: boolean; tag?: string }[] }[];
      source: string;
    };
  };
  sync: ShowcaseText & {
    mock: {
      localTitle: string;
      localPath: string;
      localFiles: string[];
      localNote: string;
      cloudTitle: string;
      cloudLines: string[];
      historyTitle: string;
      versions: { label: string; time: string }[];
      diffRemoved: string;
      diffAdded: string;
      restore: string;
    };
  };
  ai: ShowcaseText & {
    mock: {
      clientName: string;
      prompt: string;
      toolCalls: string[];
      reply: string;
      reviewTag: string;
      reviewQuote: string;
      reviewAdvice: string;
      reviewFix: string;
      accept: string;
      ignore: string;
    };
  };
  share: ShowcaseText & {
    mock: {
      url: string;
      excerpt: string;
      highlighted: string;
      comment: { author: string; text: string };
      reply: { author: string; text: string };
      exportLabel: string;
      formats: string[];
    };
  };
}

export interface Feature {
  icon: LandingIconId;
  title: string;
  desc: string;
}

export interface FeatureGroup {
  band: string;
  note: string;
  items: Feature[];
}

export interface MacCopy {
  eyebrow: string;
  title: string;
  note: string;
  bullets: string[];
  cta: string;
  requirement: string;
  footnote: string;
  window: { folders: string[]; docs: { title: string; meta: string }[]; keys: string[] };
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface LandingCopy {
  /** BCP 47 tag for JSON-LD inLanguage */
  lang: string;
  chrome: LandingChromeCopy;
  hero: HeroCopy;
  mockup: MockupCopy;
  pillars: { srTitle: string; items: Pillar[] };
  showcases: ShowcasesCopy;
  features: { eyebrow: string; title: string; note: string; groups: FeatureGroup[] };
  mac: MacCopy;
  faq: {
    eyebrow: string;
    title: string;
    /** Section note = before + contact email link + after */
    noteBefore: string;
    noteAfter: string;
    items: FaqItem[];
  };
  cta: { title: string; note: string };
  footer: {
    blurb: string;
    navAria: string;
    links: NavLink[];
    github: string;
    feedback: string;
    contactLead: string;
  };
  /** Page metadata: <title>, meta description / keywords, Open Graph and Twitter cards */
  seo: {
    title: string;
    /** ≤150 chars; also used for og:description and twitter:description */
    description: string;
    keywords: string[];
  };
  jsonLd: {
    /** WebSite / SoftwareApplication description, ≤150 chars */
    description: string;
    appSubCategory: string;
    priceCurrency: string;
  };
}
