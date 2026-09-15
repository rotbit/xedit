/**
 * Vault 后端：文档库直接落在用户选的磁盘目录上（Obsidian 式）。
 * 打开时整库读进内存，所以 LocalBackend 那些同步读照样能用；写入全部丢进一条串行队列，
 * 界面不等磁盘。id 用 "local-v:<相对路径>"，既让 isLocalId 成立，又天然带着位置信息；
 * 改名/搬家只改 entry.relPath，会话内 id 保持不变，免得编辑器手里的 id 突然失效。
 */

import { toast } from "@/components/Toast";
import { UNCATEGORIZED } from "@/features/workspace/constants";
import {
  summarize,
  type DocInit,
  type DocPatch,
  type LocalBackend,
  type LocalDocMeta,
} from "./types";
import {
  baseName,
  getDirectory,
  moveDirectory,
  moveFile,
  parentPath,
  readTextFile,
  removeEntry,
  sanitizeFileName,
  walkVault,
  writeTextFile,
} from "./vaultFs";

export interface VaultBackend extends LocalBackend {
  readonly kind: "vault";
  /** 根目录名，用来在界面上显示当前库 */
  readonly name: string;
  /** 打开时读到的侧栏排序（.xedit/order.json），没有则 null */
  loadOrder(): unknown;
  saveOrder(o: unknown): void;
  /** 等当前写队列排空，关库前调用 */
  flush(): Promise<void>;
}

const ID_PREFIX = "local-v:";
const ORDER_DIR = ".xedit";
const ORDER_FILE = "order.json";
/** 一次并发读 16 个文件：再多也就是把文件句柄堆着 */
const READ_CHUNK = 16;
/** 写失败的提示节流，避免一串失败刷满屏 */
const TOAST_GAP = 3000;

type Entry = { meta: LocalDocMeta; content: string; relPath: string };

/** 分类 → 目录相对路径：未分类就是库根 */
const catDir = (cat: string): string => (cat === UNCATEGORIZED ? "" : cat);
const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);
const stripMd = (name: string): string => name.replace(/\.md$/i, "");

function makeEntry(relPath: string, content: string, updatedAt: string): Entry {
  const dir = parentPath(relPath);
  return {
    relPath,
    content,
    meta: {
      id: ID_PREFIX + relPath,
      title: stripMd(baseName(relPath)),
      category: dir || UNCATEGORIZED,
      updatedAt,
      ...summarize(content),
    },
  };
}

async function readOrder(root: FileSystemDirectoryHandle): Promise<unknown> {
  try {
    const dir = await getDirectory(root, ORDER_DIR, false);
    if (!dir) return null;
    return JSON.parse(await readTextFile(await dir.getFileHandle(ORDER_FILE)));
  } catch {
    return null; // 没写过或者内容坏了，当没排序过
  }
}

export async function openVaultBackend(root: FileSystemDirectoryHandle): Promise<VaultBackend> {
  const { files, dirs } = await walkVault(root);
  const docs = new Map<string, Entry>();
  const cats = new Set<string>(dirs);

  for (let i = 0; i < files.length; i += READ_CHUNK) {
    const read = await Promise.all(
      files.slice(i, i + READ_CHUNK).map(async (f) => {
        const file = await f.handle.getFile();
        return { path: f.path, text: await file.text(), at: file.lastModified };
      })
    );
    for (const r of read) {
      // updatedAt 只认文件 mtime：外部编辑器改过的也能正确排到前面
      const entry = makeEntry(r.path, r.text, new Date(r.at).toISOString());
      docs.set(entry.meta.id, entry);
    }
  }

  let order = await readOrder(root);
  let queue: Promise<void> = Promise.resolve();
  let lastToast = 0;

  /** 写操作按调用顺序串行执行；出错只提示不中断后续 */
  function enqueue(op: () => Promise<void>): void {
    queue = queue.then(op).catch((e: unknown) => {
      const now = Date.now();
      if (now - lastToast < TOAST_GAP) return;
      lastToast = now;
      toast("写入文件夹失败：" + (e as Error).message, "error");
    });
  }

  /** 分类连同各级祖先一起登记，侧栏树中间层不会缺节点 */
  function addCat(cat: string): void {
    const segs = cat.split("/").filter(Boolean);
    for (let i = 1; i <= segs.length; i++) cats.add(segs.slice(0, i).join("/"));
  }

  function ensureDir(relPath: string): void {
    if (!relPath) return;
    enqueue(async () => {
      if (!(await getDirectory(root, relPath, true))) throw new Error(`建不出目录 ${relPath}`);
    });
  }

  /** 同目录下撞名就追加 " 1"、" 2"…；skipId 是自己（改名时不该和自己撞） */
  function uniqueName(dirPath: string, base: string, skipId: string | null): string {
    const taken = new Set<string>();
    for (const [id, e] of docs) {
      if (id !== skipId && parentPath(e.relPath) === dirPath) {
        taken.add(baseName(e.relPath).toLowerCase());
      }
    }
    let name = `${base}.md`;
    for (let n = 1; taken.has(name.toLowerCase()); n++) name = `${base} ${n}.md`;
    return name;
  }

  const backend: VaultBackend = {
    kind: "vault",
    name: root.name,

    listDocs(): LocalDocMeta[] {
      // 必须给副本：缓存里的 meta 是原地改的，直接交出去的话
      // 侧栏拿新旧两份列表比字段会全等（指向同一对象），改完标题不刷新
      return [...docs.values()].map((e) => ({ ...e.meta }));
    },

    getContent(id: string): string | null {
      return docs.get(id)?.content ?? null;
    },

    createDoc(init: DocInit): LocalDocMeta {
      const category = init.category?.trim() || UNCATEGORIZED;
      const content = init.content ?? "";
      const title = init.title?.slice(0, 200) || "未命名文章";
      const dirPath = catDir(category);
      const name = uniqueName(dirPath, sanitizeFileName(title), null);
      const relPath = join(dirPath, name);
      const meta: LocalDocMeta = {
        id: ID_PREFIX + relPath,
        // 文件名即标题：非法字符替换、撞名加后缀之后以磁盘上的名字为准，重开库不会变
        title: stripMd(name),
        category,
        updatedAt: new Date().toISOString(),
        ...summarize(content),
      };
      // 缓存里放副本，返回的那份给调用方自己留着（后续改动不该顺着引用倒灌回去）
      docs.set(meta.id, { meta: { ...meta }, content, relPath });
      if (dirPath) addCat(category);
      enqueue(async () => {
        const dir = await getDirectory(root, dirPath, true);
        if (!dir) throw new Error(`建不出目录 ${dirPath}`);
        await writeTextFile(dir, name, content);
      });
      return meta;
    },

    updateDoc(id: string, patch: DocPatch): boolean {
      const e = docs.get(id);
      if (!e) return false;
      const oldRel = e.relPath;
      // 先定目标目录再定文件名：撞名要按目标目录算，标题+分类同时改也只搬一次
      let dirPath = parentPath(oldRel);
      let name = baseName(oldRel);
      if (patch.category !== undefined) {
        const category = patch.category.trim() || UNCATEGORIZED;
        e.meta.category = category;
        dirPath = catDir(category);
        if (dirPath) addCat(category);
      }
      if (patch.title !== undefined) {
        const title = patch.title.slice(0, 200) || "未命名文章";
        name = uniqueName(dirPath, sanitizeFileName(title), id);
      } else if (dirPath !== parentPath(oldRel)) {
        name = uniqueName(dirPath, stripMd(name), id);
      }
      // 文件名即标题：清洗/去重之后以磁盘名为准，与重开库时读到的一致
      e.meta.title = stripMd(name);
      if (patch.content !== undefined) {
        e.content = patch.content;
        Object.assign(e.meta, summarize(patch.content));
      }
      // 仅移动分类不算编辑，不刷新时间戳
      if (patch.title !== undefined || patch.content !== undefined) {
        e.meta.updatedAt = new Date().toISOString();
      }
      const relPath = join(dirPath, name);
      if (relPath !== oldRel) {
        // moveFile 自己会按需建目标目录
        e.relPath = relPath;
        enqueue(() => moveFile(root, oldRel, relPath));
      }
      if (patch.content !== undefined) {
        const text = patch.content;
        // 路径在上一条队列任务里已经搬好了，这里直接写新位置
        enqueue(async () => {
          const dir = await getDirectory(root, parentPath(relPath), true);
          if (!dir) throw new Error(`建不出目录 ${parentPath(relPath)}`);
          await writeTextFile(dir, baseName(relPath), text);
        });
      }
      return true;
    },

    deleteDoc(id: string) {
      const e = docs.get(id);
      if (!e) return;
      docs.delete(id);
      const dirPath = parentPath(e.relPath);
      const name = baseName(e.relPath);
      enqueue(async () => {
        const dir = await getDirectory(root, dirPath, false);
        if (dir) await removeEntry(dir, name);
      });
    },

    listCats(): string[] {
      return [...cats];
    },

    /** 只补新分类的目录，这里永不删目录（删除走 removeCategory） */
    saveCats(next: string[]) {
      for (const raw of next) {
        const cat = raw.trim();
        if (!cat || cat === UNCATEGORIZED || cats.has(cat)) continue;
        addCat(cat);
        ensureDir(cat);
      }
    },

    relocateCategory(from: string, to: string) {
      const remap = (c: string) =>
        c === from ? to : c.startsWith(`${from}/`) ? to + c.slice(from.length) : c;
      for (const e of docs.values()) {
        const cat = e.meta.category || UNCATEGORIZED;
        const next = remap(cat);
        if (next === cat) continue;
        // 文件跟着目录整体搬，不必逐篇 move；只改分类不刷新 updatedAt
        e.meta.category = next;
        e.relPath = join(catDir(next), baseName(e.relPath));
      }
      const remapped = [...cats].map(remap);
      cats.clear();
      for (const c of remapped) cats.add(c);
      addCat(to);
      ensureDir(parentPath(to));
      enqueue(() => moveDirectory(root, from, to));
    },

    removeCategory(path: string) {
      const inSub = (c: string) => c === path || c.startsWith(`${path}/`);
      for (const e of docs.values()) {
        if (!inSub(e.meta.category || UNCATEGORIZED)) continue;
        e.meta.category = UNCATEGORIZED;
        const oldRel = e.relPath;
        const relPath = uniqueName("", stripMd(baseName(oldRel)), e.meta.id);
        e.relPath = relPath;
        enqueue(() => moveFile(root, oldRel, relPath));
      }
      for (const c of [...cats]) if (inSub(c)) cats.delete(c);
      enqueue(async () => {
        const parent = await getDirectory(root, parentPath(path), false);
        if (parent) await removeEntry(parent, baseName(path), true);
      });
    },

    loadOrder(): unknown {
      return order;
    },

    saveOrder(o: unknown) {
      order = o;
      enqueue(async () => {
        const dir = await getDirectory(root, ORDER_DIR, true);
        if (!dir) throw new Error(`建不出目录 ${ORDER_DIR}`);
        await writeTextFile(dir, ORDER_FILE, JSON.stringify(o));
      });
    },

    async flush() {
      await queue;
    },
  };

  return backend;
}
