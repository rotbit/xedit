"use client";

import { useState } from "react";
import {
  createLocalDoc,
  isLocalId,
  listLocalDocs,
  notifyDocsChanged,
  updateLocalDoc,
} from "@/lib/localDocs";
import { getDocContent } from "@/lib/docContent";
import { applyServerDoc, saveMirrorLocal } from "@/lib/docStore";
import { syncNow } from "@/lib/sync";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { MAX_DEPTH, UNCATEGORIZED, isVirtualCat } from "../constants";
import { mergedCloudList } from "../lib/docSource";
import type { DocMeta } from "../types";
import type { AuthMode } from "./useAuthMode";
import type { DocLibrary } from "./useDocLibrary";
import type { WorkspaceNav } from "./useWorkspaceNav";

/** 导入方式：挑若干 .md 文件，或挑一整个文件夹（子目录成为分类） */
export type ImportMode = "file" | "folder";

export interface ImportFailure {
  title: string;
  reason: string;
}

/** 一轮导入的结果摘要，交给弹窗展示 */
export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: ImportFailure[];
  /** 正文里的本地图片上传失败的张数（链接原样保留） */
  imageFailed: number;
}

/** 云端落库的并发度：再高也只是把服务端排队前移，4 条足够跑满带宽 */
const CONCURRENCY = 4;
/** 分类字段的长度上限，与 /api/documents 的 slice(0, 100) 对齐 */
const MAX_CAT_LEN = 100;
/** 只有这两个扩展名算文章 */
const MD_RE = /\.(md|markdown)$/i;
/** 图片语法的地址位：捕获 `![alt](` 前缀与紧随的地址（`<...>` 形式一并认） */
const IMG_TARGET_RE = /(!\[[^\]]*\]\(\s*)(<[^>\n]+>|[^()\s]+)/g;

interface Params {
  auth: AuthMode;
  library: DocLibrary;
  nav: WorkspaceNav;
}

/** 待导入的一篇：标题、落哪个分类、源文件、以及它在所选集合里的所在目录（解析图片相对路径用） */
interface Entry {
  title: string;
  category: string;
  file: File;
  baseDir: string;
}

/** 幂等键：同分类 + 同标题视作同一篇 */
const idxKey = (category: string | undefined, title: string) =>
  `${category || UNCATEGORIZED}\n${title}`;

/** 选中集合里的路径：文件夹模式有相对路径，文件模式只有文件名 */
const pathOf = (file: File) => file.webkitRelativePath || file.name;

/** 任一层目录（或文件名）以 . 开头就整条跳过：.obsidian、.trash、.DS_Store 等 */
const isHidden = (path: string) => path.split("/").some((seg) => seg.startsWith("."));

/** 文件名去扩展名当标题 */
function titleOf(file: File): string {
  const name = pathOf(file).split("/").pop() ?? file.name;
  return name.replace(MD_RE, "").trim().slice(0, 200) || UNTITLED_DOC;
}

/**
 * 相对路径的目录部分 → 分类路径，**含用户选中的那层根目录**：
 * 选了「工作笔记」，里面 `2024/a.md` 落到分类「工作笔记/2024」。
 * 层级超过 MAX_DEPTH 截断；总长再超字段上限就从尾部丢层级（切一半的段名没有意义）。
 */
function categoryOf(path: string, fallback: string): string {
  const segs = path.split("/").filter(Boolean);
  segs.pop(); // 最后一段是文件名
  const kept = segs.slice(0, MAX_DEPTH);
  if (kept.length === 0) return fallback;
  while (kept.length > 1 && kept.join("/").length > MAX_CAT_LEN) kept.pop();
  return kept.join("/").slice(0, MAX_CAT_LEN);
}

/** 把 `./a/../b.png` 这类相对地址按所在目录解析成选中集合内的路径 */
function resolveRel(baseDir: string, ref: string): string {
  const segs = baseDir ? baseDir.split("/") : [];
  for (const seg of ref.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") segs.pop();
    else segs.push(seg);
  }
  return segs.join("/");
}

/**
 * 图片地址 → 选中集合里的那个文件。只认库内相对路径：
 * `http(s):`、`data:`、协议相对、以 `/` 开头的绝对路径全部原样放过。
 * 文件名被 URL 编码（Obsidian 导出常见）时按解码后的名字再找一次。
 */
function mediaFor(baseDir: string, raw: string, media: Map<string, File>): File | null {
  const bare = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
  const ref = bare.replace(/[?#].*$/, "");
  if (!ref || ref.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(ref)) return null;
  const candidates = [ref];
  try {
    const decoded = decodeURIComponent(ref);
    if (decoded !== ref) candidates.push(decoded);
  } catch {
    // 半截的百分号转义（如文件名里就带 %），按原样找
  }
  for (const c of candidates) {
    const hit = media.get(resolveRel(baseDir, c));
    if (hit) return hit;
  }
  return null;
}

/** 从 File 列表整理出「要导入的文章」与「可供引用的其它文件」 */
function buildPlan(
  files: File[],
  mode: ImportMode,
  fallbackCat: string
): { entries: Entry[]; media: Map<string, File> } {
  const entries: Entry[] = [];
  const media = new Map<string, File>();
  for (const file of files) {
    const path = pathOf(file);
    if (isHidden(path)) continue;
    if (!MD_RE.test(path)) {
      media.set(path, file);
      continue;
    }
    const folder = mode === "folder" && file.webkitRelativePath;
    entries.push({
      title: titleOf(file),
      category: folder ? categoryOf(path, fallbackCat) : fallbackCat,
      file,
      baseDir: folder ? path.split("/").slice(0, -1).join("/") : "",
    });
  }
  return { entries, media };
}

/** 同分类同标题的几篇排进同一条队列：并发跑会互相看不见对方刚建出来的那篇 */
function groupByKey(entries: Entry[]): Entry[][] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = idxKey(e.category, e.title);
    const list = groups.get(k);
    if (list) list.push(e);
    else groups.set(k, [e]);
  }
  return [...groups.values()];
}

/** 定量并发地跑完一批任务（任务自己吞掉异常） */
async function runPool(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

/** 接口失败的人话原因 */
async function failReason(res: Response): Promise<string> {
  const data: unknown = await res.json().catch(() => null);
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error) return error;
  if (res.status === 401) return "登录已失效，请重新登录";
  return `保存失败（${res.status}）`;
}

function reasonOf(err: unknown): string {
  if (err instanceof DOMException) return "浏览器存储空间不足";
  if (err instanceof Error && err.message) return err.message;
  return "导入失败";
}

/**
 * 导入本地 Markdown：单向、一次性、手动触发——不监听磁盘也不回写，
 * 重复导入按「同分类 + 同标题」幂等（正文不同则更新，相同则跳过，没有则新建）。
 */
export function useImportDocs({ auth, library, nav }: Params) {
  const { localMode, online } = auth;
  const { setDocs } = library;
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  /** 文件模式落在当前分类（停在虚拟视图上时归「未分类」），与 createDoc 同一套算法 */
  const targetCat = isVirtualCat(nav.activeCat) ? UNCATEGORIZED : nav.activeCat;

  const importFiles = async (files: File[], mode: ImportMode): Promise<ImportResult> => {
    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: [], imageFailed: 0 };
    if (importing) return result;
    const { entries, media } = buildPlan(files, mode, targetCat);
    setProgress({ done: 0, total: entries.length });
    if (entries.length === 0) return result;

    // 未登录（本地模式）与登录但离线，都先落本地：后者的改动由同步引擎联网后自动上云
    const offline = localMode || !online;
    const relist = localMode ? listLocalDocs : mergedCloudList;
    const base: DocMeta[] = offline ? relist() : (library.docs ?? mergedCloudList());
    const index = new Map<string, string>();
    for (const doc of base) {
      const k = idxKey(doc.category, doc.title);
      if (!index.has(k)) index.set(k, doc.id); // 库里本就重名时只认第一篇
    }

    /** 本轮的图片上传缓存：同一张图只传一次，失败也记住不再重试 */
    const uploads = new Map<string, Promise<string | null>>();
    const uploadMedia = (path: string, file: File) => {
      let pending = uploads.get(path);
      if (!pending) {
        pending = uploadMediaFile(file).catch(() => {
          result.imageFailed += 1;
          return null; // 失败就保留原链接
        });
        uploads.set(path, pending);
      }
      return pending;
    };

    /** 正文里指向选中集合的本地图片换成上传后的 URL；本地模式/离线不处理，原样保留 */
    const rewriteImages = async (content: string, baseDir: string): Promise<string> => {
      const found = new Map<string, File>(); // 原始地址 → 源文件
      for (const m of content.matchAll(IMG_TARGET_RE)) {
        if (found.has(m[2])) continue;
        const file = mediaFor(baseDir, m[2], media);
        if (file) found.set(m[2], file);
      }
      if (found.size === 0) return content;
      const urls = new Map<string, string>();
      await Promise.all(
        [...found].map(async ([raw, file]) => {
          const url = await uploadMedia(pathOf(file), file);
          if (url) urls.set(raw, url);
        })
      );
      return content.replace(IMG_TARGET_RE, (whole, prefix: string, target: string) => {
        const url = urls.get(target);
        return url ? prefix + url : whole;
      });
    };

    /** 已有文章的本地写入：未上云的落本地库，已上云的落镜像并标脏交给同步引擎 */
    const writeLocal = (id: string, content: string) => {
      if (isLocalId(id)) updateLocalDoc(id, { content });
      else saveMirrorLocal(id, { content });
    };

    const importOne = async (entry: Entry) => {
      let content = await entry.file.text();
      // 图片要传上云才有 URL 可写进正文，所以只有登录且在线的文件夹导入才处理
      if (!offline && entry.baseDir !== "") content = await rewriteImages(content, entry.baseDir);

      const k = idxKey(entry.category, entry.title);
      const existing = index.get(k);
      if (existing) {
        if (getDocContent(existing) === content) {
          result.skipped += 1;
          return;
        }
        if (offline || isLocalId(existing)) {
          writeLocal(existing, content);
          result.updated += 1;
          return;
        }
        const res = await fetch(`/api/documents/${existing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) throw new Error(await failReason(res));
        saveMirrorLocal(existing, { content }, false); // 云端已确认，镜像跟上但不标脏
        result.updated += 1;
        return;
      }

      if (offline) {
        const doc = createLocalDoc({ category: entry.category, title: entry.title, content });
        index.set(k, doc.id);
        result.created += 1;
        return;
      }
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: entry.title, content, category: entry.category }),
      });
      if (!res.ok) throw new Error(await failReason(res));
      const doc = await res.json();
      applyServerDoc(doc); // 新文档立即入镜像，编辑页/离线随时可用
      index.set(k, doc.id);
      result.created += 1;
    };

    setImporting(true);
    try {
      const tasks = groupByKey(entries).map((group) => async () => {
        for (const entry of group) {
          try {
            await importOne(entry);
          } catch (err) {
            result.failed.push({ title: entry.title, reason: reasonOf(err) });
          }
          setProgress((p) => ({ done: p.done + 1, total: p.total }));
        }
      });
      await runPool(tasks, CONCURRENCY);
    } finally {
      setImporting(false);
    }

    setDocs(relist());
    if (offline) notifyDocsChanged();
    else void syncNow(); // 本地建的稿（离线时）与正文改动交给同步引擎推上云
    return result;
  };

  return { importFiles, importing, progress, targetCat };
}

export type DocImporter = ReturnType<typeof useImportDocs>;
