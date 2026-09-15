/**
 * 文章正文的读取口：本地库 `xedit-local-doc:*` 与云端镜像 `xedit-mirror-doc:*` 各存各的，
 * 按 id 前缀分流。从 docSearch.ts 里抽出来只为把依赖理顺——
 * 标签（docTags）与检索（docSearch）都要读正文，而检索又要用标签，
 * 放在一起就成了环；正文读取本来就是最底下那一层。
 */

import { getMirrorContent } from "@/lib/docStore";
import { getLocalDocContent, isLocalId } from "@/lib/localDocs";

/** 取不到（如镜像尚未拉取）当空文 */
export function getDocContent(id: string): string {
  return (isLocalId(id) ? getLocalDocContent(id) : getMirrorContent(id)) ?? "";
}
