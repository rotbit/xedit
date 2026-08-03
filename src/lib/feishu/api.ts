import { FEISHU } from "./config";

/**
 * 飞书 OpenAPI 客户端（用户身份）。
 * docx 块列表与素材下载都是单应用 5 QPS 的特殊频控，所有请求过同一个全局节流闸。
 */

const MIN_GAP_MS = 250;
let nextSlot = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

interface ApiEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
}

async function apiGet<T>(
  token: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  await throttle();
  const url = new URL(`${FEISHU.apiBase}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!body || body.code !== 0) {
    throw new Error(`飞书接口错误（${path.split("/")[1]}）：${body?.msg ?? `HTTP ${res.status}`}`);
  }
  return body.data as T;
}

/** 写方向的调用：docx 编辑接口频控更紧（单文档 3 QPS），间隔放大一档 */
async function apiSend<T>(
  token: string,
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  payload: unknown
): Promise<T> {
  await throttle();
  await throttle(); // 两个节流槽 = 500ms 间隔
  const res = await fetch(`${FEISHU.apiBase}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!body || body.code !== 0) {
    throw new Error(`飞书接口错误（${path.split("/")[1]}）：${body?.msg ?? `HTTP ${res.status}`}`);
  }
  return body.data as T;
}

// ---- 知识空间 ----

export interface FeishuSpace {
  id: string;
  name: string;
}

export async function listFeishuSpaces(token: string): Promise<FeishuSpace[]> {
  const spaces: FeishuSpace[] = [];
  let pageToken = "";
  // 权限过滤可能返回空页但 has_more=true，必须翻到底，不能见空即止
  do {
    const data = await apiGet<{
      items?: { space_id: string; name: string }[];
      page_token?: string;
      has_more?: boolean;
    }>(token, "/wiki/v2/spaces", { page_size: "50", page_token: pageToken });
    for (const it of data.items ?? []) spaces.push({ id: it.space_id, name: it.name });
    pageToken = data.has_more ? (data.page_token ?? "") : "";
  } while (pageToken);
  return spaces;
}

// ---- 知识空间节点树 ----

export interface WikiNode {
  nodeToken: string;
  objToken: string;
  objType: string;
  nodeType: string;
  title: string;
  objEditTime: string;
  /** 祖先节点标题链（不含自身），用于映射成 xedit 分类路径 */
  path: string[];
}

/** 单次同步最多处理的节点数：防个别巨型知识库把一轮同步拖死 */
export const MAX_WIKI_NODES = 1000;

interface RawNode {
  node_token: string;
  obj_token: string;
  obj_type: string;
  node_type: string;
  title: string;
  obj_edit_time: string;
  has_child: boolean;
}

/** 广度优先抓全空间节点。超过 MAX_WIKI_NODES 截断并置 truncated */
export async function listAllWikiNodes(
  token: string,
  spaceId: string
): Promise<{ nodes: WikiNode[]; truncated: boolean }> {
  const nodes: WikiNode[] = [];
  const queue: { parent: string; path: string[] }[] = [{ parent: "", path: [] }];
  while (queue.length > 0) {
    const { parent, path } = queue.shift()!;
    let pageToken = "";
    do {
      const data = await apiGet<{
        items?: RawNode[];
        page_token?: string;
        has_more?: boolean;
      }>(token, `/wiki/v2/spaces/${spaceId}/nodes`, {
        page_size: "50",
        page_token: pageToken,
        parent_node_token: parent,
      });
      for (const it of data.items ?? []) {
        if (nodes.length >= MAX_WIKI_NODES) return { nodes, truncated: true };
        nodes.push({
          nodeToken: it.node_token,
          objToken: it.obj_token,
          objType: it.obj_type,
          nodeType: it.node_type,
          title: it.title,
          objEditTime: it.obj_edit_time ?? "",
          path,
        });
        if (it.has_child) {
          queue.push({ parent: it.node_token, path: [...path, it.title] });
        }
      }
      pageToken = data.has_more ? (data.page_token ?? "") : "";
    } while (pageToken);
  }
  return { nodes, truncated: false };
}

// ---- docx 文档块 ----

export interface FeishuBlock {
  block_id: string;
  parent_id?: string;
  children?: string[];
  block_type: number;
  [key: string]: unknown;
}

export async function listDocBlocks(token: string, documentId: string): Promise<FeishuBlock[]> {
  const blocks: FeishuBlock[] = [];
  let pageToken = "";
  do {
    const data = await apiGet<{
      items?: FeishuBlock[];
      page_token?: string;
      has_more?: boolean;
    }>(token, `/docx/v1/documents/${documentId}/blocks`, {
      page_size: "500",
      page_token: pageToken,
    });
    blocks.push(...(data.items ?? []));
    pageToken = data.has_more ? (data.page_token ?? "") : "";
  } while (pageToken);
  return blocks;
}

// ---- 素材下载（文档内图片）----

export async function downloadFeishuMedia(
  token: string,
  fileToken: string
): Promise<{ buffer: Buffer; mime: string }> {
  await throttle();
  const res = await fetch(`${FEISHU.apiBase}/drive/v1/medias/${fileToken}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`图片下载失败: HTTP ${res.status}`);
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  return { buffer: Buffer.from(await res.arrayBuffer()), mime };
}

// ---- 写方向：推送 / 写回 ----

export interface WikiNodeInfo {
  nodeToken: string;
  objToken: string;
  objEditTime: string;
  spaceId: string;
  title: string;
}

interface RawNodeInfo {
  node_token: string;
  obj_token: string;
  obj_edit_time?: string;
  space_id: string;
  title?: string;
}

/** 按节点 token 取单个节点（冲突检查与推送后回读编辑时间用） */
export async function getWikiNode(token: string, nodeToken: string): Promise<WikiNodeInfo> {
  const data = await apiGet<{ node?: RawNodeInfo }>(token, "/wiki/v2/spaces/get_node", {
    token: nodeToken,
    obj_type: "wiki",
  });
  const n = data.node;
  if (!n) throw new Error("飞书侧找不到该节点");
  return {
    nodeToken: n.node_token,
    objToken: n.obj_token,
    objEditTime: n.obj_edit_time ?? "",
    spaceId: n.space_id,
    title: n.title ?? "",
  };
}

/** 在知识空间根下新建一个 docx 节点（推送新文章用） */
export async function createWikiDocNode(
  token: string,
  spaceId: string,
  title: string
): Promise<{ nodeToken: string; objToken: string }> {
  const data = await apiSend<{ node?: RawNodeInfo }>(
    token,
    "POST",
    `/wiki/v2/spaces/${spaceId}/nodes`,
    { obj_type: "docx", node_type: "origin", title }
  );
  if (!data.node) throw new Error("创建知识库节点失败");
  return { nodeToken: data.node.node_token, objToken: data.node.obj_token };
}

/** 写回时同步节点标题；失败不致命，调用方自行吞错 */
export async function renameWikiNode(
  token: string,
  spaceId: string,
  nodeToken: string,
  title: string
): Promise<void> {
  await apiSend(token, "POST", `/wiki/v2/spaces/${spaceId}/nodes/${nodeToken}/update_title`, {
    title,
  });
}

/** 清空某块的子块（整篇覆盖前先清空正文）；分片删避免单次范围过大 */
export async function deleteDocChildren(
  token: string,
  documentId: string,
  blockId: string,
  count: number
): Promise<void> {
  let remaining = count;
  while (remaining > 0) {
    const step = Math.min(remaining, 50);
    await apiSend(
      token,
      "DELETE",
      `/docx/v1/documents/${documentId}/blocks/${blockId}/children/batch_delete`,
      { start_index: 0, end_index: step }
    );
    remaining -= step;
  }
}

/** 创建嵌套块：一次调用写入一批顶层块及其子树（列表嵌套、表格单元格都靠它） */
export async function createDocDescendants(
  token: string,
  documentId: string,
  blockId: string,
  index: number,
  childrenId: string[],
  descendants: unknown[]
): Promise<void> {
  await apiSend(
    token,
    "POST",
    `/docx/v1/documents/${documentId}/blocks/${blockId}/descendants`,
    { children_id: childrenId, index, descendants }
  );
}

/** 上传图片素材，挂到指定 image 块名下；返回 file_token */
export async function uploadFeishuMedia(
  token: string,
  buffer: Buffer,
  mime: string,
  imageBlockId: string
): Promise<string> {
  await throttle();
  await throttle();
  const ext = mime.split("/")[1]?.split("+")[0] || "png";
  const form = new FormData();
  form.set("file_name", `image.${ext}`);
  form.set("parent_type", "docx_image");
  form.set("parent_node", imageBlockId);
  form.set("size", String(buffer.byteLength));
  form.set("file", new Blob([new Uint8Array(buffer)], { type: mime }), `image.${ext}`);
  const res = await fetch(`${FEISHU.apiBase}/drive/v1/medias/upload_all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<{
    file_token?: string;
  }> | null;
  if (!body || body.code !== 0 || !body.data?.file_token) {
    throw new Error(`图片上传失败：${body?.msg ?? `HTTP ${res.status}`}`);
  }
  return body.data.file_token;
}

/** 把上传好的素材 token 填进空 image 块 */
export async function fillImageBlock(
  token: string,
  documentId: string,
  imageBlockId: string,
  fileToken: string
): Promise<void> {
  await apiSend(token, "PATCH", `/docx/v1/documents/${documentId}/blocks/${imageBlockId}`, {
    replace_image: { token: fileToken },
  });
}
