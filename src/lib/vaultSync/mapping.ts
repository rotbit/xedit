"use client";

/**
 * A 步：解析映射 —— 把索引里的每条「云端 id ↔ 本地文件」对到当前的两端现状上。
 * 认领顺序：会话内记住的 vault id（改名不换 id，最准）→ 索引里的相对路径 →
 * 改名探测（文件不在原位，就在没认领的文件里找正文哈希一致的那篇，视为改名/搬家）。
 * 剩下的分四类交给后面几步：两端都在的逐篇比对、只有本地的上云、只有云端的下载、
 * 以及一端已经没了的删除对齐。
 */

import type { MirrorMeta } from "@/lib/docStore";
import type { LocalDocMeta } from "@/lib/localBackend";
import { unlinkDoc, type SyncDocRef, type SyncRun } from "./index";

/** 两端都在的一篇 */
export interface SyncPair {
  cloudId: string;
  vaultId: string;
  /** 上次一致时的路径与哈希，比对的 base */
  ref: SyncDocRef;
}

export interface Mapping {
  pairs: SyncPair[];
  /** 正库里没被认领的文件（vault id）→ 当新文档上云 */
  unmappedLocal: Set<string>;
  /** 镜像里没进索引的云端文档 → 下载到库 */
  unmappedCloud: Map<string, MirrorMeta>;
  /** 映射还在、本地文件没了 → 云端也该删 */
  localGone: string[];
  /** 映射还在、镜像里没了（云端删的）→ 本地进回收站 */
  cloudGone: { cloudId: string; vaultId: string }[];
}

export function resolveMappings(
  run: SyncRun,
  locals: LocalDocMeta[],
  mirrors: MirrorMeta[]
): Mapping {
  const mirrorById = new Map(mirrors.map((m) => [m.id, m]));
  // 没被任何一条映射认领的本地文件，认领过程中逐个摘掉
  const unclaimed = new Set(locals.map((m) => m.id));
  const map: Mapping = {
    pairs: [],
    unmappedLocal: unclaimed,
    unmappedCloud: new Map(),
    localGone: [],
    cloudGone: [],
  };

  for (const [cloudId, ref] of Object.entries(run.idx.docs)) {
    const mirror = mirrorById.get(cloudId);
    const vaultId = claim(run, cloudId, ref, unclaimed);
    if (!vaultId) {
      // 本地文件找不回来了：云端还在就去删云端，云端也没了就是条僵尸映射，清掉
      if (mirror) map.localGone.push(cloudId);
      else unlinkDoc(run, cloudId);
      continue;
    }
    run.links.set(cloudId, vaultId);
    if (mirror) map.pairs.push({ cloudId, vaultId, ref });
    else map.cloudGone.push({ cloudId, vaultId });
  }

  for (const m of mirrors) if (!run.idx.docs[m.id]) map.unmappedCloud.set(m.id, m);
  return map;
}

/** 认领一个本地文件；认到就从 unclaimed 里摘掉，认不到返回 null */
function claim(
  run: SyncRun,
  cloudId: string,
  ref: SyncDocRef,
  unclaimed: Set<string>
): string | null {
  const remembered = run.links.get(cloudId);
  if (remembered && unclaimed.has(remembered)) {
    unclaimed.delete(remembered);
    return remembered;
  }
  const byPath = run.vault.idAtPath(ref.relPath);
  if (byPath && unclaimed.has(byPath)) {
    unclaimed.delete(byPath);
    return byPath;
  }
  // 改名探测：正文一字没动、只是换了名字或换了文件夹
  for (const id of unclaimed) {
    if (run.hashOf(id, run.vault.getContent(id) ?? "") !== ref.hash) continue;
    unclaimed.delete(id);
    return id;
  }
  return null;
}
