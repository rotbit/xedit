/**
 * Vault 的文件系统原语：只包 File System Access API，不掺文档语义。
 * 目录布局是 <vault>/<分类路径>/<标题>.md —— 文件名即标题、目录即分类，不写 frontmatter；
 * 点号开头的条目（.obsidian/.xedit/.trash/.DS_Store…）一概跳过，顶层的 attachments 也跳过。
 */

import { MAX_DEPTH } from "@/features/workspace/constants";

// TS 5.9 的 lib.dom 里还缺目录选择器、句柄权限查询、handle.move，
// 目录异步迭代在 dom.asynciterable（未进 tsconfig.lib），这里按 Chromium 实际行为补最小声明
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
      id?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?: (desc?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (desc?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    /** Chrome 111+ 才有；缺了就退回「读→写→删」三步 */
    move?: (parent: FileSystemDirectoryHandle, name?: string) => Promise<void>;
  }
  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  }
}

/** 文件名上限：给 255 字节的文件系统留足余量（中文 3 字节/字） */
const MAX_NAME = 120;

/** 附件目录：固定在库根下叫 attachments。它既不是分类也不装文章，
 *  里面是图片等二进制，所以扫库时在顶层整个跳过（更深层的同名目录仍按普通分类算） */
export const ATTACHMENTS_DIR = "attachments";

/** 一次并发读 16 个文件：再多也就是把文件句柄堆着 */
const READ_CHUNK = 16;

/** 文件名里非法或不安全的字符：控制字符、路径分隔符与 Windows 保留符号 */
const ILLEGAL = /[\x00-\x1f\x7f/\\:*?"<>|]/g;

export const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
export const parentPath = (p: string): string =>
  p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";

export function isVaultSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** 用户取消返回 null，其它错误（如非安全上下文）抛出去 */
export async function pickVaultDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === "undefined" || !window.showDirectoryPicker) return null;
  try {
    return await window.showDirectoryPicker({ mode: "readwrite", id: "xedit-vault" });
  } catch (e) {
    if ((e as DOMException | null)?.name === "AbortError") return null;
    throw e;
  }
}

export async function queryVaultPermission(
  handle: FileSystemDirectoryHandle
): Promise<PermissionState> {
  // 查不了权限就当有，真写不进去时自然会报错
  if (!handle.queryPermission) return "granted";
  return await handle.queryPermission({ mode: "readwrite" });
}

/** 必须在用户手势里调用，否则浏览器直接拒 */
export async function requestVaultPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.requestPermission) return true;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/** 标题 → 合法文件名（不含扩展名）：非法字符换成 -，尾部的点和空格要去掉（Windows 不认） */
export function sanitizeFileName(title: string): string {
  let name = title.trim().replace(ILLEGAL, "-").replace(/\s+/g, " ").replace(/[.\s]+$/, "");
  if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME).replace(/[.\s]+$/, "");
  return name || "未命名文章";
}

export interface VaultFileEntry {
  /** 相对 vault 根的 / 连接路径 */
  path: string;
  handle: FileSystemFileHandle;
}

export interface WalkOptions {
  /** 顶层的点号条目与 attachments 也一并扫进来：扫 .trash 内部时用它
   *  （回收站里就是普通的分类目录与文章），扫正库不要开 */
  includeDotRoot?: boolean;
}

/** 递归扫一个目录：只有 .md 算文章，但每个非点号目录（哪怕空的）都算一个分类。
 *  返回的 path 相对传进来的这个目录，不是相对库根 */
export async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  opts: WalkOptions = {}
): Promise<{ files: VaultFileEntry[]; dirs: string[] }> {
  const files: VaultFileEntry[] = [];
  const dirs: string[] = [];
  const walk = async (d: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    // 顶层那两条过滤（点号条目、附件目录）在扫 .trash 内部时要关掉
    const filterTop = depth > 0 || !opts.includeDotRoot;
    for await (const [name, handle] of d.entries()) {
      if (name.startsWith(".") && filterTop) continue;
      if (depth === 0 && filterTop && name === ATTACHMENTS_DIR) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        dirs.push(path);
        if (depth + 1 < MAX_DEPTH) {
          await walk(handle as FileSystemDirectoryHandle, path, depth + 1);
        }
      } else if (name.toLowerCase().endsWith(".md")) {
        files.push({ path, handle: handle as FileSystemFileHandle });
      }
    }
  };
  await walk(dir, "", 0);
  return { files, dirs };
}

/** 扫整个库：顶层跳过点号目录（.obsidian/.xedit/.trash…）与 attachments */
export async function walkVault(
  root: FileSystemDirectoryHandle
): Promise<{ files: VaultFileEntry[]; dirs: string[] }> {
  return await walkDirectory(root);
}

/** 分批读内容：一次并发 16 个，够快又不至于把整库句柄全开着。
 *  needText 判 false 的文件只取 mtime 不读正文（对账时没变的跳过），对应 text = null */
export async function readVaultFiles(
  files: readonly VaultFileEntry[],
  onFile: (path: string, mtime: number, text: string | null) => void,
  needText?: (path: string, mtime: number) => boolean
): Promise<void> {
  for (let i = 0; i < files.length; i += READ_CHUNK) {
    const read = await Promise.all(
      files.slice(i, i + READ_CHUNK).map(async (f) => {
        const file = await f.handle.getFile();
        const mtime = file.lastModified;
        return {
          path: f.path,
          mtime,
          text: !needText || needText(f.path, mtime) ? await file.text() : null,
        };
      })
    );
    for (const r of read) onFile(r.path, r.mtime, r.text);
  }
}

/** relPath 为空即根目录；create 时建不出来直接抛，只读时找不到返回 null */
export async function getDirectory(
  root: FileSystemDirectoryHandle,
  relPath: string,
  create: boolean
): Promise<FileSystemDirectoryHandle | null> {
  let dir = root;
  for (const seg of relPath.split("/").filter(Boolean)) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create });
    } catch (e) {
      if (!create) return null;
      throw e;
    }
  }
  return dir;
}

/** 写完回读 file.lastModified 并返回：调用方把它记回 entry.mtime，
 *  对账时才不会把自己刚写的文件当成外部改动 */
async function writeData(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: string | Blob
): Promise<number> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(data);
    await w.close();
  } catch (e) {
    // 中途失败就放弃这次写入，别留个被截断的半截文件
    await w.abort().catch(() => undefined);
    throw e;
  }
  return (await fh.getFile()).lastModified;
}

/** 返回写完之后的文件 mtime */
export async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string
): Promise<number> {
  return await writeData(dir, name, text);
}

/** 图片等二进制按 Blob 原样写，别经手字符串 */
export async function writeBlobFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  blob: Blob
): Promise<number> {
  return await writeData(dir, name, blob);
}

export async function readTextFile(handle: FileSystemFileHandle): Promise<string> {
  return await (await handle.getFile()).text();
}

export async function removeEntry(
  dir: FileSystemDirectoryHandle,
  name: string,
  recursive = false
): Promise<void> {
  await dir.removeEntry(name, { recursive });
}

/** 读某个相对路径的文件 mtime；不在磁盘上返回 0 */
export async function fileMtime(
  root: FileSystemDirectoryHandle,
  relPath: string
): Promise<number> {
  const dir = await getDirectory(root, parentPath(relPath), false);
  if (!dir) return 0;
  try {
    return (await (await dir.getFileHandle(baseName(relPath))).getFile()).lastModified;
  } catch {
    return 0;
  }
}

/** 改名/换目录：有原生 move 就用，没有就读+写+删。返回新位置的文件 mtime */
export async function moveFile(
  root: FileSystemDirectoryHandle,
  fromRel: string,
  toRel: string
): Promise<number> {
  if (fromRel === toRel) return await fileMtime(root, toRel);
  const fromDir = await getDirectory(root, parentPath(fromRel), false);
  if (!fromDir) throw new Error(`找不到目录 ${parentPath(fromRel) || "/"}`);
  const toDir = await getDirectory(root, parentPath(toRel), true);
  if (!toDir) throw new Error(`建不出目录 ${parentPath(toRel) || "/"}`);
  const fromName = baseName(fromRel);
  const toName = baseName(toRel);
  const fh = await fromDir.getFileHandle(fromName);
  if (typeof fh.move === "function") {
    await fh.move(toDir, toName);
    // 原生 move 之后句柄已指向新位置
    return (await fh.getFile()).lastModified;
  }
  const mtime = await copyFile(fh, toDir, toName);
  await fromDir.removeEntry(fromName);
  return mtime;
}

/** 目录改名/搬家：原生 move 只管文件，目录只能整棵复制再删原处 */
export async function moveDirectory(
  root: FileSystemDirectoryHandle,
  fromRel: string,
  toRel: string
): Promise<void> {
  if (fromRel === toRel) return;
  if (toRel.startsWith(`${fromRel}/`)) throw new Error("不能把文件夹搬进它自己里");
  const from = await getDirectory(root, fromRel, false);
  if (!from) return; // 源目录压根不在磁盘上（只存在于索引里），不用搬
  const to = await getDirectory(root, toRel, true);
  if (!to) throw new Error(`建不出目录 ${toRel}`);
  await copyDir(from, to);
  const fromParent = await getDirectory(root, parentPath(fromRel), false);
  await fromParent?.removeEntry(baseName(fromRel), { recursive: true });
}

/** 按 Blob 原样复制，图片等二进制附件走这条路才不会被当文本弄坏 */
async function copyFile(
  fh: FileSystemFileHandle,
  toDir: FileSystemDirectoryHandle,
  name: string
): Promise<number> {
  return await writeData(toDir, name, await fh.getFile());
}

/** 整棵复制，包括点号条目——搬文件夹得连里面的附件一起带走 */
async function copyDir(
  from: FileSystemDirectoryHandle,
  to: FileSystemDirectoryHandle
): Promise<void> {
  for await (const [name, handle] of from.entries()) {
    if (handle.kind === "directory") {
      const sub = await to.getDirectoryHandle(name, { create: true });
      await copyDir(handle as FileSystemDirectoryHandle, sub);
    } else {
      await copyFile(handle as FileSystemFileHandle, to, name);
    }
  }
}
