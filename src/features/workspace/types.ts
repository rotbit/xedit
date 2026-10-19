
/** Doc list item: metadata shared by the local library and the cloud mirror */
export interface DocMeta {
  id: string;
  title: string;
  category?: string;
  /** Creation time (ISO). Old mirrors and Vault disk files may lack it */
  createdAt?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
}

/** Deployment capability flags exposed by /api/config (third-party login buttons and the image library entry show/hide based on these) */
export interface AppConfig {
  github: boolean;
  google: boolean;
  wechat: boolean;
  oss: boolean;
  /** The site has an image-generation token configured (whether "AI generate" covers are available also depends on being an admin) */
  coverGenerate: boolean;
  /**
   * Whether AI review can run right now: whether the model provider selected in the admin panel has a token configured.
   * The review panel uses this to decide if "Start review" is grayed out; actual permission is decided by the server's 401 / 403. Older responses lack this field, so it's optional.
   */
  aiReview?: boolean;
}

/** Category tree node: docs are direct docs, count includes descendant categories */
export interface CatNode {
  name: string;
  path: string;
  children: CatNode[];
  docs: DocMeta[];
  /** Display sequence of subcategories and direct docs (can be interleaved); children/docs are still kept for counting and lookup */
  items: CatItem[];
  count: number;
}

/** One item under a category node: a subcategory or a direct doc */
export type CatItem = { kind: "cat"; node: CatNode } | { kind: "doc"; doc: DocMeta };

/** The object being dragged: a doc, or a category (moved as a whole with its subtree and docs) */
export type DragItem = { kind: "doc"; id: string } | { kind: "cat"; path: string };
