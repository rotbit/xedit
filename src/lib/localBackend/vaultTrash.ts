/**
 * Vault 的回收站：删文章不真删，先搬进 <vault>/.trash/ 并保留原来的目录结构，
 * 用户还能还原或彻底删。回收站单独一份内存缓存（开库时扫 .trash 建起来），
 * 条目的 relPath 记的是相对 .trash 的路径 —— 原来的分类就从这个路径推出来。
 */

import type { LocalDocMeta } from "./types";
import {
  addCat,
  dirCat,
  ID_PREFIX,
  join,
  makeEntry,
  stripMd,
  uniqueDocId,
  uniqueName,
  type Entry,
  type VaultCtx,
} from "./vaultEntry";
import {
  baseName,
  getDirectory,
  moveFile,
  parentPath,
  readVaultFiles,
  removeEntry,
  walkDirectory,
} from "./vaultFs";

/** 回收站目录：点号开头，扫库时被当成元数据目录跳过，Obsidian 也不会把它当文库内容 */
export const TRASH_DIR = ".trash";

/** 回收站条目的 id 与它在磁盘上的位置，都由「相对 .trash 的路径」推出来 */
const trashId = (rel: string): string => `${ID_PREFIX}${TRASH_DIR}/${rel}`;
const trashPath = (rel: string): string => `${TRASH_DIR}/${rel}`;

/** 开库时扫一遍 .trash；没这个目录就是空回收站 */
export async function loadTrash(root: FileSystemDirectoryHandle): Promise<Map<string, Entry>> {
  const trash = new Map<string, Entry>();
  const dir = await getDirectory(root, TRASH_DIR, false);
  if (!dir) return trash;
  // 直接拿 .trash 的句柄往下扫，所以顶层过滤要关掉（里面是普通的分类目录与文章）
  const { files } = await walkDirectory(dir, { includeDotRoot: true });
  await readVaultFiles(files, (path, mtime, text) => {
    const entry = makeEntry(path, text ?? "", mtime, trashId(path));
    trash.set(entry.meta.id, entry);
  });
  return trash;
}

export interface TrashOps {
  /** 把正库里的一篇搬进回收站；调用方负责先把它从 docs 里摘掉 */
  moveToTrash(e: Entry): void;
  listTrash(): LocalDocMeta[];
  restoreFromTrash(id: string): LocalDocMeta | null;
  purgeFromTrash(id: string): void;
  emptyTrash(): void;
}

export function createTrash(ctx: VaultCtx): TrashOps {
  return {
    moveToTrash(e: Entry) {
      const dirPath = parentPath(e.relPath);
      // .trash 里按原路径放，同位置撞名就追加 " 1"、" 2"…
      const name = uniqueName(ctx.trash.values(), dirPath, stripMd(baseName(e.relPath)), null);
      const rel = join(dirPath, name);
      const id = trashId(rel);
      // 正库那份 meta 直接沿用（摘要、字数、时间都还准），只换 id 与去重后的标题
      const entry: Entry = {
        relPath: rel,
        content: e.content,
        mtime: e.mtime,
        meta: { ...e.meta, id, title: stripMd(name), category: dirCat(dirPath) },
      };
      ctx.trash.set(id, entry);
      const from = e.relPath;
      ctx.enqueue(async () => {
        // moveFile 自己会把 .trash 及下面的分类目录建出来
        entry.mtime = await moveFile(ctx.root, from, trashPath(rel));
      });
    },

    /** 与 listDocs 同理：必须给副本，否则界面比字段时新旧两份指向同一对象 */
    listTrash(): LocalDocMeta[] {
      return [...ctx.trash.values()].map((e) => ({ ...e.meta }));
    },

    restoreFromTrash(id: string): LocalDocMeta | null {
      const t = ctx.trash.get(id);
      if (!t) return null;
      ctx.trash.delete(id);
      // 原路径被别人占了就加后缀，原来的分类目录没了就重新建
      const dirPath = parentPath(t.relPath);
      const name = uniqueName(ctx.docs.values(), dirPath, stripMd(baseName(t.relPath)), null);
      const rel = join(dirPath, name);
      const newId = uniqueDocId(ctx.docs, rel);
      const entry: Entry = {
        relPath: rel,
        content: t.content,
        mtime: t.mtime,
        meta: { ...t.meta, id: newId, title: stripMd(name), category: dirCat(dirPath) },
      };
      ctx.docs.set(newId, entry);
      if (dirPath) addCat(ctx.cats, dirPath);
      ctx.enqueue(async () => {
        entry.mtime = await moveFile(ctx.root, trashPath(t.relPath), rel);
      });
      return { ...entry.meta };
    },

    purgeFromTrash(id: string) {
      const t = ctx.trash.get(id);
      if (!t) return;
      ctx.trash.delete(id);
      const path = trashPath(t.relPath);
      ctx.enqueue(async () => {
        const dir = await getDirectory(ctx.root, parentPath(path), false);
        if (dir) await removeEntry(dir, baseName(path));
      });
    },

    emptyTrash() {
      ctx.trash.clear();
      // 整个 .trash 端掉，下次删文章时 moveFile 会自己把它建回来
      ctx.enqueue(async () => {
        if (!(await getDirectory(ctx.root, TRASH_DIR, false))) return;
        await removeEntry(ctx.root, TRASH_DIR, true);
      });
    },
  };
}
