"use client";

/**
 * 同步引擎用到的云端一侧：文档接口的三个小包装，外加「一篇云端文档在库里该放哪」的换算。
 * 所有请求失败都只返回 null / false，由调用方计入 pending 下轮再试 —— 单篇失败不中断整轮。
 */

import { UNCATEGORIZED } from "@/features/workspace/constants";
import { applyServerDoc, getMirrorContent, type MirrorMeta, type ServerDoc } from "@/lib/docStore";
import { catDir, join } from "@/lib/localBackend/vaultEntry";
import { sanitizeFileName } from "@/lib/localBackend/vaultFs";

/** 镜像里的分类，空的按「未分类」算 */
export const mirrorCategory = (m: MirrorMeta): string => m.category?.trim() || UNCATEGORIZED;

/** 云端文档在库里的期望路径：分类即目录、标题即文件名 */
export function expectedRelPath(m: MirrorMeta): string {
  return join(catDir(mirrorCategory(m)), `${sanitizeFileName(m.title)}.md`);
}

/** 拉一篇的完整内容（镜像只有元数据时补齐用） */
export async function fetchCloudDoc(id: string): Promise<ServerDoc | null> {
  try {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) return null;
    const doc = (await res.json()) as ServerDoc | null;
    return doc && typeof doc.content === "string" ? doc : null;
  } catch {
    return null;
  }
}

/** 镜像里的正文；只有元数据时在线补拉一次并落镜像，离线或拉不到返回 null（本篇这轮跳过） */
export async function ensureMirrorContent(id: string, online: boolean): Promise<string | null> {
  const hit = getMirrorContent(id);
  if (hit !== null) return hit;
  if (!online) return null;
  const doc = await fetchCloudDoc(id);
  if (!doc) return null;
  applyServerDoc(doc);
  return doc.content;
}

/** 新建云端文档，返回整篇（含 id）；失败返回 null */
export async function createCloudDoc(init: {
  title: string;
  content: string;
  category: string;
}): Promise<ServerDoc | null> {
  try {
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(init),
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as ServerDoc | null;
    return doc && typeof doc.id === "string" ? doc : null;
  } catch {
    return null;
  }
}

/** 软删一篇（进云端回收站）。404 也算删成功：它本来就不在了 */
export async function deleteCloudDoc(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
