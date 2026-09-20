import type { AiProviderId } from "@/lib/ai/providers";

/** 文章列表项：本地库与云端镜像共用的元信息 */
export interface DocMeta {
  id: string;
  title: string;
  category?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
}

/** /api/config 暴露的部署能力开关（第三方登录按钮、图片库入口据此显隐） */
export interface AppConfig {
  github: boolean;
  google: boolean;
  wechat: boolean;
  oss: boolean;
  /** 站点配了生图 Token（「AI 生成」封面是否可用还要看是不是管理员） */
  coverGenerate: boolean;
  /**
   * 服务端配了 key 的 AI 供应商（同样只对管理员开放）。
   * 审核面板据此决定「开始审核」是不是灰的：没配的那几家选了也跑不了，
   * 配了的能不能用由服务端的 401 / 403 说。旧版本的回答里没有这个字段，所以是可选的。
   */
  aiProviders?: AiProviderId[];
}

/** 分类树节点：docs 为直属文章，count 含子孙分类 */
export interface CatNode {
  name: string;
  path: string;
  children: CatNode[];
  docs: DocMeta[];
  /** 子分类与直属文章的显示序列（两者可混排）；children/docs 仍保留供计数、查找使用 */
  items: CatItem[];
  count: number;
}

/** 分类节点下的一项：子分类或直属文章 */
export type CatItem = { kind: "cat"; node: CatNode } | { kind: "doc"; doc: DocMeta };

/** 正在拖拽的对象：文章，或分类（分类连同子树与其中文章整体随迁） */
export type DragItem = { kind: "doc"; id: string } | { kind: "cat"; path: string };
