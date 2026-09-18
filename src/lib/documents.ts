import type { Document } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chinaDate } from "@/lib/active";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import { plainText, summarize } from "@/lib/excerpt";
import { autoSnapshot, AUTOSAVE_RULE } from "@/lib/versions";
import { wordCount } from "@/lib/wordCount";

/**
 * 文档增删改查的共享服务层：REST 路由与 MCP 工具共用同一套逻辑，避免行为漂移。
 * 所有操作都以 userId 隔离，跨用户不可见、不可改。
 */

function clampLimit(v: number | undefined, def: number, max: number): number {
  if (!v || !Number.isFinite(v)) return def;
  return Math.min(Math.max(Math.floor(v), 1), max);
}

export interface DocSummary {
  id: string;
  title: string;
  category: string;
  updatedAt: Date;
  excerpt: string;
  chars: number;
}

export interface DocFull {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 整行 → 对外的 DocFull 形状（正文之外的内部字段不外泄） */
function toDocFull(doc: Document): DocFull {
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    category: doc.category,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * 文库列表。limit="all" 不限条数——REST 列表接口要把整份文库下发给前端，
 * MCP 那边则始终带上限（默认 50），别让工具一次吐出几百篇。
 *
 * 正文仍要整份取：字数是全篇口径，截断了就不准；
 * 但摘要只扫开头（见 excerpt.ts 的预切），长文不会被整篇跑五遍正则。
 */
export async function listDocuments(
  userId: string,
  opts: { trash?: boolean; category?: string; limit?: number | "all" } = {}
): Promise<DocSummary[]> {
  const docs = await prisma.document.findMany({
    where: {
      userId,
      deletedAt: opts.trash ? { not: null } : null,
      ...(opts.category ? { category: opts.category } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: opts.limit === "all" ? undefined : clampLimit(opts.limit, 50, 200),
    select: { id: true, title: true, category: true, updatedAt: true, content: true },
  });
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    updatedAt: d.updatedAt,
    excerpt: summarize(d.content),
    chars: wordCount(d.content),
  }));
}

/** 命中片段的取景窗：命中处往前留 40 字，整段 120 字。
 *  这是检索上下文、不是列表摘要，所以不跟 EXCERPT_MAX 走同一个数。 */
const SNIPPET_BEFORE = 40;
const SNIPPET_WIDTH = 120;

/** 在匹配位置附近截取一小段上下文，帮助定位命中。
 *  plain 由调用方传入：同一篇正文的纯文本化只做一次，别在这里重跑一遍。 */
function snippetAround(plain: string, query: string): string {
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return plain.slice(0, SNIPPET_WIDTH);
  const start = Math.max(0, idx - SNIPPET_BEFORE);
  return (start > 0 ? "…" : "") + plain.slice(start, start + SNIPPET_WIDTH);
}

export async function searchDocuments(
  userId: string,
  query: string,
  limit = 20
): Promise<DocSummary[]> {
  const q = query.trim();
  if (!q) return [];
  const docs = await prisma.document.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: clampLimit(limit, 20, 100),
    select: { id: true, title: true, category: true, updatedAt: true, content: true },
  });
  return docs.map((d) => {
    const plain = plainText(d.content);
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      updatedAt: d.updatedAt,
      excerpt: snippetAround(plain, q),
      chars: wordCount(d.content),
    };
  });
}

export async function getDocument(userId: string, id: string): Promise<DocFull | null> {
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc || doc.deletedAt) return null;
  return toDocFull(doc);
}

/** 客户端去重键的长度上限；跟标题一样在服务端截断，不信客户端给的长度 */
const CLIENT_KEY_MAX = 100;

export interface CreateDocInput {
  title?: string;
  content?: string;
  category?: string;
  /**
   * 客户端去重键（可选），同一账号下唯一。离线新建与弱网重试会把同一条「新建」
   * 发好几遍，带上同一个 key 就只落一篇，后到的那几次直接拿回先落的那篇。
   */
  clientKey?: string;
}

/** 去重键规范化：空白串当没传，超长截断 */
function normalizeClientKey(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, CLIENT_KEY_MAX) : null;
}

/** 唯一约束冲突。不 import Prisma 的错误类，只认错误码，纯逻辑单测里也好构造 */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * 新建文档并返回整行：REST 的新建接口要整行落本地镜像，MCP 与飞书同步只要三个字段，
 * 去重与字段裁剪收在这里一份，两条通道不会漂。
 *
 * 带 clientKey 时是幂等的：先按 (userId, clientKey) 找，找到就原样返回已有那篇（不改写它），
 * 没有才建；两个重试同时走到 create 时靠唯一约束兜底，撞了（P2002）再查一次拿回赢的那篇。
 * 查找不排除回收站——唯一约束本身不看 deletedAt，这里跟它保持同一口径，
 * 否则用户删掉后同 key 重试会直接撞约束报错。
 */
export async function createDocumentRow(
  userId: string,
  input: CreateDocInput
): Promise<Document> {
  const clientKey = normalizeClientKey(input.clientKey);
  if (clientKey) {
    const existing = await prisma.document.findFirst({ where: { userId, clientKey } });
    if (existing) return existing;
  }
  const data = {
    userId,
    title: input.title && input.title.trim() ? input.title.slice(0, 200) : UNTITLED_DOC,
    content: typeof input.content === "string" ? input.content : "",
    category:
      input.category && input.category.trim()
        ? input.category.trim().slice(0, 100)
        : UNCATEGORIZED,
    ...(clientKey ? { clientKey } : {}),
  };
  try {
    return await prisma.document.create({ data });
  } catch (e) {
    if (!clientKey || !isUniqueViolation(e)) throw e;
    const raced = await prisma.document.findFirst({ where: { userId, clientKey } });
    if (!raced) throw e;
    return raced;
  }
}

/** 新建文档，只回调用方用得上的三个字段（MCP 工具、飞书同步） */
export async function createDocument(
  userId: string,
  input: CreateDocInput
): Promise<{ id: string; title: string; category: string }> {
  const { id, title, category } = await createDocumentRow(userId, input);
  return { id, title, category };
}

/**
 * 更新结果。写成了带回服务端时间戳；被别的设备抢先写过则带回服务端当前这一版，
 * 让调用方去做合并。文档不存在（或在回收站）统一用 null 表示。
 */
export type UpdateOutcome =
  | { conflict: false; updatedAt: Date }
  | { conflict: true; doc: DocFull };

export interface UpdateDocInput {
  title?: string;
  content?: string;
  category?: string;
  /**
   * 客户端这次编辑所基于的服务端版本时刻。传了就是条件更新（乐观锁）：
   * 服务端仍停在这个时刻才写得进去，否则回冲突让客户端自己合并。
   * 不传 = 无条件覆盖，与历史行为完全一致——老客户端、MCP 工具、飞书同步都走这条。
   */
  baseUpdatedAt?: string | number | Date | null;
}

/** 把 baseUpdatedAt 解析成 Date；空值与不合法值一律当没传（要拦的调用方自己先校验） */
export function parseBaseUpdatedAt(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" && typeof v !== "number" && !(v instanceof Date)) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 条件更新这次要盖的时间戳——自己盖，而不是让 @updatedAt 刷新完再查一遍。
 *
 * @updatedAt 在 updateMany 下同样会自动刷新（与 update 是同一条写参数处理路径），
 * 但 updateMany 不回行：要拿刷新后的值只能再 findFirst 一次，而这两步之间别人若又写了一次，
 * 回给客户端的就成了对方那次的时刻——客户端拿它当自己这次保存的基准，下一次条件保存
 * 反倒会正好覆盖掉对方。自己盖章就没有这条缝：写进去什么就回什么。
 *
 * 毫秒精度：DateTime 在 Postgres 上映射 timestamp(3)，与 JS Date 同为毫秒刻度，
 * 所以 where 里用 updatedAt 做等值比较是可靠的，不会因为精度截断而永远匹配不上。
 * 同一毫秒内连写两次时时间戳不变，会让这一次写入对后来者「不可见」，故至少往后挪 1ms。
 */
function nextStamp(base: Date): Date {
  const now = Date.now();
  return new Date(now > base.getTime() ? now : base.getTime() + 1);
}

/** 正文真的变了才留版并记当日写作流水；编辑器保存与 MCP 写入共用这一份副作用 */
async function recordContentChange(
  userId: string,
  id: string,
  existing: { title: string; content: string },
  data: { title?: string; content?: string }
): Promise<void> {
  if (typeof data.content !== "string" || data.content === existing.content) return;
  await autoSnapshot(id, data.title ?? existing.title, data.content, AUTOSAVE_RULE);
  const delta = Math.max(0, wordCount(data.content) - wordCount(existing.content));
  const date = chinaDate();
  await prisma.writingActivity.upsert({
    where: { userId_date: { userId, date } },
    update: { saves: { increment: 1 }, charsAdded: { increment: delta } },
    create: { userId, date, saves: 1, charsAdded: delta },
  });
}

/**
 * 更新文档。仅更新传入的字段；正文变化时自动留版并记当日写作流水，
 * 与编辑器保存走完全相同的副作用。文档不存在（或在回收站）返回 null。
 *
 * 成功时把服务端 updatedAt 带回去：客户端镜像要记的是服务器时间，
 * 本机时钟快的机器若拿本地时间当保存时刻，之后「服务端更新才替换」的比较会误判成本地更新。
 */
export async function updateDocument(
  userId: string,
  id: string,
  input: UpdateDocInput
): Promise<UpdateOutcome | null> {
  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing || existing.deletedAt) return null;

  const data: { title?: string; content?: string; category?: string } = {};
  if (typeof input.title === "string") data.title = input.title.slice(0, 200) || UNTITLED_DOC;
  if (typeof input.content === "string") data.content = input.content;
  if (typeof input.category === "string") {
    data.category = input.category.trim().slice(0, 100) || UNCATEGORIZED;
  }

  const base = parseBaseUpdatedAt(input.baseUpdatedAt);
  if (base) {
    // 条件更新：where 里带上 updatedAt=base，比较与写入在同一条 UPDATE 里由数据库完成，
    // 两个设备并发保存不会都成功——先到的把时间戳推走，后到的匹配 0 行。
    const stamp = nextStamp(base);
    const { count } = await prisma.document.updateMany({
      where: { id, userId, deletedAt: null, updatedAt: base },
      data: { ...data, updatedAt: stamp },
    });
    if (count === 0) {
      // 没写进去：要么被抢先写过（冲突，把服务端当前这版带回去让客户端合并），
      // 要么这期间被删/移进了回收站（按不存在处理，与无条件路径口径一致）
      const fresh = await prisma.document.findFirst({ where: { id, userId } });
      if (!fresh || fresh.deletedAt) return null;
      return { conflict: true, doc: toDocFull(fresh) };
    }
    await recordContentChange(userId, id, existing, data);
    return { conflict: false, updatedAt: stamp };
  }

  // 下面的留版与流水都不动 document 行，这里取到的 updatedAt 就是本次保存的最终时刻
  const updated = await prisma.document.update({
    where: { id },
    data,
    select: { updatedAt: true },
  });
  await recordContentChange(userId, id, existing, data);
  return { conflict: false, updatedAt: updated.updatedAt };
}

/** 删除文档：默认软删除（移入回收站）；hard=true 永久删除。未命中返回 false。 */
export async function deleteDocument(
  userId: string,
  id: string,
  hard = false
): Promise<boolean> {
  const result = hard
    ? await prisma.document.deleteMany({ where: { id, userId } })
    : await prisma.document.updateMany({
        where: { id, userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
  return result.count > 0;
}
