/**
 * 本地文档库的后端契约：门面 `@/lib/localDocs` 只管转发，具体存储由后端实现。
 * 现有的 localStorage 实现在 ./browserBackend，后续的磁盘 Vault 再加一个实现即可。
 */

import { summarize as excerptOf } from "@/lib/excerpt";
import { wordCount } from "@/lib/wordCount";

export interface LocalDocMeta {
  id: string;
  title: string;
  category?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
}

export interface DocPatch {
  title?: string;
  content?: string;
  category?: string;
}

export interface DocInit {
  title?: string;
  content?: string;
  category?: string;
}

/** 本地文档库的存储后端：浏览器 localStorage 或（后续）磁盘 Vault。
 *  读取全部同步（Vault 后端会在打开时把全库读进内存缓存）。 */
export interface LocalBackend {
  readonly kind: "browser" | "vault";
  /** 顺序不限，门面负责按 updatedAt 倒序 */
  listDocs(): LocalDocMeta[];
  getContent(id: string): string | null;
  createDoc(init: DocInit): LocalDocMeta;
  /** 返回是否命中文档；广播 notifyDocsChanged 由门面负责，后端不要自己发 */
  updateDoc(id: string, patch: DocPatch): boolean;
  deleteDoc(id: string): void;
  listCats(): string[];
  saveCats(cats: string[]): void;
  /** 把分类 from（含子孙分类与其中文章）整体迁移为 to；文章仅改分类不刷新 updatedAt */
  relocateCategory(from: string, to: string): void;
  /** 删除分类 path 及其子孙；其中文章归到 UNCATEGORIZED（即「未分类」） */
  removeCategory(path: string): void;
}

/** 本地库列表项的摘要与字数。两者的口径都不在这里定：
 *  摘要走 excerpt.ts（与服务端列表接口同一份实现），字数走 wordCount。 */
export function summarize(content: string): { excerpt: string; chars: number } {
  return { excerpt: excerptOf(content), chars: wordCount(content) };
}
