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
import { applyServerDoc, getMirrorRev, markMirrorSynced, saveMirrorLocal } from "@/lib/docStore";
import { syncNow } from "@/lib/sync";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { t } from "@/i18n/t";
import { MAX_DEPTH, UNCATEGORIZED, isVirtualCat } from "../constants";
import { mergedCloudList } from "../lib/docSource";
import type { DocMeta } from "../types";
import type { AuthMode } from "./useAuthMode";
import type { DocLibrary } from "./useDocLibrary";
import type { WorkspaceNav } from "./useWorkspaceNav";

/** Import mode: pick some .md files, or a whole folder (subdirectories become categories) */
export type ImportMode = "file" | "folder";

export interface ImportFailure {
  title: string;
  reason: string;
}

/** Summary of one import run, shown in the dialog */
export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: ImportFailure[];
  /** Number of local images in bodies that failed to upload (links kept as-is) */
  imageFailed: number;
}

/** Concurrency for cloud writes: going higher just moves server-side queueing earlier; 4 is enough to saturate bandwidth */
const CONCURRENCY = 4;
/** Max length of the category field, matching slice(0, 100) in /api/documents */
const MAX_CAT_LEN = 100;
/** Only these two extensions count as documents */
const MD_RE = /\.(md|markdown)$/i;
/** URL slot of image syntax: captures the `![alt](` prefix and the URL right after (the `<...>` form is recognized too) */
const IMG_TARGET_RE = /(!\[[^\]]*\]\(\s*)(<[^>\n]+>|[^()\s]+)/g;

interface Params {
  auth: AuthMode;
  library: DocLibrary;
  nav: WorkspaceNav;
}

/** One doc to import: title, target category, source file, and its directory within the selected set (for resolving relative image paths) */
interface Entry {
  title: string;
  category: string;
  file: File;
  baseDir: string;
}

/** Idempotency key: same category + same title counts as the same doc */
const idxKey = (category: string | undefined, title: string) =>
  `${category || UNCATEGORIZED}\n${title}`;

/** Path within the selected set: folder mode has relative paths, file mode only file names */
const pathOf = (file: File) => file.webkitRelativePath || file.name;

/** Skip the whole entry if any directory (or the file name) starts with a dot: .obsidian, .trash, .DS_Store, etc. */
const isHidden = (path: string) => path.split("/").some((seg) => seg.startsWith("."));

/** File name without extension as the title */
function titleOf(file: File): string {
  const name = pathOf(file).split("/").pop() ?? file.name;
  return name.replace(MD_RE, "").trim().slice(0, 200) || UNTITLED_DOC;
}

/**
 * Directory part of a relative path → category path, **including the root folder the user selected**:
 * selecting 「工作笔记」 puts its `2024/a.md` into the category 「工作笔记/2024」.
 * Depth beyond MAX_DEPTH is truncated; if the total still exceeds the field limit, drop levels from the end (a half-cut segment name is meaningless).
 */
function categoryOf(path: string, fallback: string, prefix = ""): string {
  const segs = path.split("/").filter(Boolean);
  segs.pop(); // The last segment is the file name
  // A target folder was given: nest the whole directory tree under it, still truncating by depth and length limits
  if (prefix) segs.unshift(...prefix.split("/"));
  const kept = segs.slice(0, MAX_DEPTH);
  if (kept.length === 0) return fallback;
  while (kept.length > 1 && kept.join("/").length > MAX_CAT_LEN) kept.pop();
  return kept.join("/").slice(0, MAX_CAT_LEN);
}

/** Resolve relative URLs like `./a/../b.png` against their directory into a path within the selected set */
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
 * Image URL → the file in the selected set. Only relative in-library paths count:
 * `http(s):`, `data:`, protocol-relative, and absolute paths starting with `/` are all left as-is.
 * When the file name is URL-encoded (common in Obsidian exports), try again with the decoded name.
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
    // Broken percent escapes (e.g. a file name that contains %): look it up as-is
  }
  for (const c of candidates) {
    const hit = media.get(resolveRel(baseDir, c));
    if (hit) return hit;
  }
  return null;
}

/** Sort a File list into "docs to import" and "other files that can be referenced" */
function buildPlan(
  files: File[],
  mode: ImportMode,
  fallbackCat: string,
  /** In folder mode, the folder to nest the directory tree under; empty = top level as before */
  prefix = ""
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
      category: folder ? categoryOf(path, fallbackCat, prefix) : fallbackCat,
      file,
      baseDir: folder ? path.split("/").slice(0, -1).join("/") : "",
    });
  }
  return { entries, media };
}

/** Docs with the same category and title go into the same queue: run concurrently, they can't see the one the other just created */
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

/** Run a batch of tasks with fixed concurrency (tasks swallow their own errors) */
async function runPool(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

/** Human-readable reason for an API failure */
async function failReason(res: Response): Promise<string> {
  const data: unknown = await res.json().catch(() => null);
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error) return error;
  if (res.status === 401) return t("登录已失效，请重新登录");
  return t("保存失败（{status}）", { status: res.status });
}

function reasonOf(err: unknown): string {
  if (err instanceof DOMException) return t("浏览器存储空间不足");
  // The server reason (data.error passed through by failReason) is a Chinese dictionary key: translate it if it matches
  if (err instanceof Error && err.message) return t(err.message);
  return t("导入失败");
}

/**
 * Import local Markdown: one-way, one-off, manually triggered — no disk watching and no write-back.
 * Re-imports are idempotent on "same category + same title" (update if the body differs, skip if identical, create if missing).
 */
export function useImportDocs({ auth, library, nav }: Params) {
  const { localMode, online } = auth;
  const { setDocs } = library;
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  /** File mode lands in the current category (「未分类」 when on a virtual view), using the same logic as createDoc */
  const targetCat = isVirtualCat(nav.activeCat) ? UNCATEGORIZED : nav.activeCat;

  /**
   * @param cat Explicit target (set when importing from a folder's context menu in the file tree); if omitted, follow the current category.
   *            Values passed in are normalized for virtual views too, so callers don't need to check.
   */
  const importFiles = async (
    files: File[],
    mode: ImportMode,
    cat?: string
  ): Promise<ImportResult> => {
    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: [], imageFailed: 0 };
    if (importing) return result;
    const fallbackCat = cat === undefined ? targetCat : isVirtualCat(cat) ? UNCATEGORIZED : cat;
    // Only an explicitly specified real folder becomes a prefix: the default "current category" doesn't nest, preserving old behavior and re-import idempotency
    const prefix = cat !== undefined && !isVirtualCat(cat) && cat !== UNCATEGORIZED ? cat : "";
    const { entries, media } = buildPlan(files, mode, fallbackCat, prefix);
    setProgress({ done: 0, total: entries.length });
    if (entries.length === 0) return result;

    // Logged out (local mode) and logged in but offline both save locally first: the latter's changes are uploaded by the sync engine once online
    const offline = localMode || !online;
    const relist = localMode ? listLocalDocs : mergedCloudList;
    // Dedupe against the whole library (including the hidden todo-list doc), not the sidebar-visible list
    const base: DocMeta[] = offline ? relist() : (library.allDocs ?? mergedCloudList());
    const index = new Map<string, string>();
    for (const doc of base) {
      const k = idxKey(doc.category, doc.title);
      if (!index.has(k)) index.set(k, doc.id); // If the library already has duplicate titles, only the first counts
    }

    /** Image upload cache for this run: each image is uploaded once, and failures are remembered and not retried */
    const uploads = new Map<string, Promise<string | null>>();
    const uploadMedia = (path: string, file: File) => {
      let pending = uploads.get(path);
      if (!pending) {
        pending = uploadMediaFile(file).catch(() => {
          result.imageFailed += 1;
          return null; // On failure keep the original link
        });
        uploads.set(path, pending);
      }
      return pending;
    };

    /** Replace local images in the body that point into the selected set with uploaded URLs; skipped in local mode / offline, left as-is */
    const rewriteImages = async (content: string, baseDir: string): Promise<string> => {
      const found = new Map<string, File>(); // Original URL → source file
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

    /** Local write for an existing doc: not-yet-uploaded ones go to the local library, uploaded ones go to the mirror marked dirty for the sync engine */
    const writeLocal = (id: string, content: string) => {
      if (isLocalId(id)) updateLocalDoc(id, { content });
      else saveMirrorLocal(id, { content });
    };

    const importOne = async (entry: Entry) => {
      let content = await entry.file.text();
      // Images must be uploaded to get a URL to write into the body, so only folder imports while logged in and online handle them
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
        const saved = await res.json().catch(() => null);
        saveMirrorLocal(existing, { content }, false); // Confirmed by the cloud: update the mirror without marking dirty
        // saveMirrorLocal records local time; overwrite it with the server time from the response,
        // otherwise with a fast local clock, opening this doc would misjudge the cloud as "older" and never refresh it.
        // Pass the rev just written: this is the confirmed version, and it also sets the conflict baseline to the server version
        if (typeof saved?.updatedAt === "string")
          markMirrorSynced(existing, getMirrorRev(existing), saved.updatedAt);
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
      applyServerDoc(doc); // New docs go into the mirror right away, available to the editor and offline at any time
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
    else void syncNow(); // Docs created locally (while offline) and body changes are pushed to the cloud by the sync engine
    return result;
  };

  return { importFiles, importing, progress, targetCat };
}

export type DocImporter = ReturnType<typeof useImportDocs>;
