// Serialized types shared by the share page and the server (types only, no runtime deps, safe to import on both sides)

export type AnchorType = "text" | "media";

export interface ShareCommentJson {
  id: string;
  parentId: string | null;
  author: string;
  isOwner: boolean;
  /** Whether the current visitor/user can act on it (their own annotation, or the doc author) */
  mine: boolean;
  /** text = selected text; media = image/video (anchorText is the src) */
  anchorType: AnchorType;
  anchorText: string;
  anchorPrefix: string;
  anchorIndex: number;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SharePayload {
  token: string;
  title: string;
  authorName: string;
  updatedAt: string;
  content: string;
  themeName: string;
  themeCss: string;
  codeThemeId: string;
  customCss: string;
  macCode: boolean;
  allowComment: boolean;
  viewerIsOwner: boolean;
  initialComments: ShareCommentJson[];
}
