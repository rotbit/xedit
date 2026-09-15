/**
 * Vault 的文档条目与共用上下文：id、磁盘路径、分类之间的换算规则都收在这里，
 * 正库（vaultBackend）、回收站（vaultTrash）、磁盘对账（vaultRescan）三边共用同一套。
 */

import { UNCATEGORIZED } from "@/features/workspace/constants";
import { summarize, type LocalDocMeta } from "./types";
import { baseName, parentPath } from "./vaultFs";

export const ID_PREFIX = "local-v:";

/** 内存缓存里的一篇：meta 给界面，content 给编辑器，relPath 指磁盘位置；
 *  mtime 是最后一次「我们自己写」或「从磁盘读」时的 file.lastModified ——
 *  对账时靠它把自己的写入排除掉，只认外部编辑器的改动 */
export type Entry = {
  meta: LocalDocMeta;
  content: string;
  relPath: string;
  mtime: number;
};

/** 各子模块共用的会话上下文：根句柄 + 内存缓存 + 写队列 */
export interface VaultCtx {
  readonly root: FileSystemDirectoryHandle;
  /** 正库：id → 条目，relPath 相对库根 */
  readonly docs: Map<string, Entry>;
  /** 回收站：id → 条目，relPath 相对 .trash 目录 */
  readonly trash: Map<string, Entry>;
  readonly cats: Set<string>;
  /** 写操作串行队列：界面不等磁盘 */
  enqueue: (op: () => Promise<void>) => void;
  /** 等当前写队列排空 */
  flush: () => Promise<void>;
}

/** 分类 → 目录相对路径：未分类就是库根 */
export const catDir = (cat: string): string => (cat === UNCATEGORIZED ? "" : cat);
/** 目录相对路径 → 分类：库根就是未分类 */
export const dirCat = (dir: string): string => dir || UNCATEGORIZED;
export const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);
export const stripMd = (name: string): string => name.replace(/\.md$/i, "");

/** 从磁盘读到的一篇：文件名即标题、目录即分类，updatedAt 只认文件 mtime
 *  （外部编辑器改过的也能正确排到前面）。id 默认按路径推，撞了由调用方给 */
export function makeEntry(relPath: string, content: string, mtime: number, id?: string): Entry {
  return {
    relPath,
    content,
    mtime,
    meta: {
      id: id ?? ID_PREFIX + relPath,
      title: stripMd(baseName(relPath)),
      category: dirCat(parentPath(relPath)),
      updatedAt: new Date(mtime).toISOString(),
      ...summarize(content),
    },
  };
}

/** 分类连同各级祖先一起登记，侧栏树中间层不会缺节点 */
export function addCat(cats: Set<string>, cat: string): void {
  const segs = cat.split("/").filter(Boolean);
  for (let i = 1; i <= segs.length; i++) cats.add(segs.slice(0, i).join("/"));
}

/** 同目录下撞名就追加 " 1"、" 2"…；skipId 是自己（改名时不该和自己撞） */
export function uniqueName(
  entries: Iterable<Entry>,
  dirPath: string,
  base: string,
  skipId: string | null
): string {
  const taken = new Set<string>();
  for (const e of entries) {
    if (e.meta.id !== skipId && parentPath(e.relPath) === dirPath) {
      taken.add(baseName(e.relPath).toLowerCase());
    }
  }
  let name = `${base}.md`;
  for (let n = 1; taken.has(name.toLowerCase()); n++) name = `${base} ${n}.md`;
  return name;
}

/** id 按路径推（local-v:<relPath>），但会话内改名只改 relPath 不动 id，
 *  老 id 可能还占着这个路径；撞了就加 #2、#3…，保证会话内 id 唯一 */
export function uniqueDocId(docs: Map<string, Entry>, relPath: string): string {
  const base = ID_PREFIX + relPath;
  if (!docs.has(base)) return base;
  let n = 2;
  while (docs.has(`${base}#${n}`)) n++;
  return `${base}#${n}`;
}
