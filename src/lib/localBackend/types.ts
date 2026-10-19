/**
 * Backend contract for the local document library: the facade `@/lib/localDocs` only forwards; storage is up to the backend.
 * The existing localStorage implementation is ./browserBackend; the disk Vault is just another implementation.
 */

import { summarize as excerptOf } from "@/lib/excerpt";
import { wordCount } from "@/lib/wordCount";

export interface LocalDocMeta {
  id: string;
  title: string;
  category?: string;
  /** Creation time (ISO). Only set for documents created in this app; the Vault can't get a reliable creation time from disk */
  createdAt?: string;
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

/** Storage backend for the local document library: browser localStorage or the disk Vault.
 *  All reads are synchronous (the Vault backend loads the whole library into memory on open). */
export interface LocalBackend {
  readonly kind: "browser" | "vault";
  /** Any order; the facade sorts by updatedAt descending */
  listDocs(): LocalDocMeta[];
  getContent(id: string): string | null;
  createDoc(init: DocInit): LocalDocMeta;
  /** Returns whether the document was found; the facade broadcasts notifyDocsChanged, backends must not */
  updateDoc(id: string, patch: DocPatch): boolean;
  deleteDoc(id: string): void;
  listCats(): string[];
  saveCats(cats: string[]): void;
  /** Move category `from` (with descendant categories and their articles) to `to`; articles only change category, updatedAt untouched */
  relocateCategory(from: string, to: string): void;
  /** Delete category `path` and its descendants; their articles go to UNCATEGORIZED (「未分类」, Uncategorized) */
  removeCategory(path: string): void;
}

/** Excerpt and word count for local library list items. Neither rule is defined here:
 *  excerpts come from excerpt.ts (same implementation as the server list API), word counts from wordCount. */
export function summarize(content: string): { excerpt: string; chars: number } {
  return { excerpt: excerptOf(content), chars: wordCount(content) };
}
