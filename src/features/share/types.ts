// 分享页与服务端共用的序列化类型（纯类型，无运行时依赖，两端可安全引用）

export type AnchorType = "text" | "media";

export interface ShareCommentJson {
  id: string;
  parentId: string | null;
  author: string;
  isOwner: boolean;
  /** 当前访客/登录者是否可操作（自己的批注，或文档作者） */
  mine: boolean;
  /** text=选中文字；media=图片/视频（anchorText 为 src） */
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
  expiresAt: string;
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
