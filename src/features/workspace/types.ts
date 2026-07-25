/** 文章列表项：本地库与云端镜像共用的元信息 */
export interface DocMeta {
  id: string;
  title: string;
  category?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
}

/** /api/config 暴露的部署能力开关 */
export interface AppConfig {
  github: boolean;
  google: boolean;
  oss: boolean;
}

/** 分类树节点：docs 为直属文章，count 含子孙分类 */
export interface CatNode {
  name: string;
  path: string;
  children: CatNode[];
  docs: DocMeta[];
  count: number;
}

/** 正在拖拽的对象：文章，或分类（分类连同子树与其中文章整体随迁） */
export type DragItem = { kind: "doc"; id: string } | { kind: "cat"; path: string };
