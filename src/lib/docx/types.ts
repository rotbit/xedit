// 导出 Word · 共享类型与常量：媒体/公式的中间产物结构、行内样式、块级 AST 节点别名，以及排版用的字体/颜色/尺寸常量。

import {
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Paragraph,
  Table,
  TextRun,
} from "docx";

/** 正文可用宽度（px @96dpi）：A4 减去默认页边距 */
export const CONTENT_W = 600;
export const BODY_FONT = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "微软雅黑" };
export const MONO_FONT = { ascii: "Consolas", hAnsi: "Consolas", eastAsia: "微软雅黑" };
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
  /** src → 已就绪的图片字节；null 表示获取失败 */
  images: Map<string, PreparedImage | null>;
  /** 公式节点 → 栅格化后的 PNG */
  math: Map<Element, PreparedImage | null>;
  /** 视频节点 → 封面帧（poster 或抓取的首帧）；null 表示拿不到 */
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
