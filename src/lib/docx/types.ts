// Word export · shared types and constants: intermediate structures for media/formulas, inline styles, block AST node aliases, and font/color/size constants for layout.

import {
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Paragraph,
  Table,
  TextRun,
} from "docx";

/** Usable body width (px @96dpi): A4 minus default page margins */
export const CONTENT_W = 600;
export const BODY_FONT = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "微软雅黑" }; // i18n-ignore Word East Asian font name; this is data
export const MONO_FONT = { ascii: "Consolas", hAnsi: "Consolas", eastAsia: "微软雅黑" }; // i18n-ignore Word East Asian font name; this is data
export const INK = "1F2329";
export const GRAY = "8A8F99";
export const LINK_BLUE = "1155CC";
export const OL_REF = "xe-ol";

export interface PreparedImage {
  data: ArrayBuffer;
  type: "png" | "jpg" | "gif";
  width: number;
  height: number;
}

export interface Build {
  /** src → ready image bytes; null means fetching failed */
  images: Map<string, PreparedImage | null>;
  /** Formula node → rasterized PNG */
  math: Map<Element, PreparedImage | null>;
  /** Video node → poster frame (poster or grabbed first frame); null means unavailable */
  frames: Map<Element, PreparedImage | null>;
  olInstance: number;
  failed: number;
}

export interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  sup?: boolean;
  sub?: boolean;
  color?: string;
  size?: number;
}

export type InlineChild = TextRun | ImageRun | ExternalHyperlink;
export type BlockChild = Paragraph | Table;

export const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

export const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "FIGURE", "BLOCKQUOTE", "PRE",
  "UL", "OL", "TABLE", "HR", "VIDEO", "H1", "H2", "H3", "H4", "H5", "H6",
]);
