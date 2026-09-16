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
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    category: doc.category,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function createDocument(
  userId: string,
  input: { title?: string; content?: string; category?: string }
): Promise<{ id: string; title: string; category: string }> {
  const doc = await prisma.document.create({
    data: {
      userId,
      title: input.title && input.title.trim() ? input.title.slice(0, 200) : UNTITLED_DOC,
      content: typeof input.content === "string" ? input.content : "",
      category:
        input.category && input.category.trim()
          ? input.category.trim().slice(0, 100)
          : UNCATEGORIZED,
    },
    select: { id: true, title: true, category: true },
  });
  return doc;
}

/**
 * 更新文档。仅更新传入的字段；正文变化时自动留版并记当日写作流水，
 * 与编辑器保存走完全相同的副作用。文档不存在（或在回收站）返回 false。
 */
export async function updateDocument(
  userId: string,
  id: string,
  input: { title?: string; content?: string; category?: string }
): Promise<boolean> {
  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing || existing.deletedAt) return false;

  const data: { title?: string; content?: string; category?: string } = {};
  if (typeof input.title === "string") data.title = input.title.slice(0, 200) || UNTITLED_DOC;
  if (typeof input.content === "string") data.content = input.content;
  if (typeof input.category === "string") {
    data.category = input.category.trim().slice(0, 100) || UNCATEGORIZED;
  }
  await prisma.document.update({ where: { id }, data });

  if (typeof data.content === "string" && data.content !== existing.content) {
    await autoSnapshot(id, data.title ?? existing.title, data.content, AUTOSAVE_RULE);
    const delta = Math.max(0, wordCount(data.content) - wordCount(existing.content));
    const date = chinaDate();
    await prisma.writingActivity.upsert({
      where: { userId_date: { userId, date } },
      update: { saves: { increment: 1 }, charsAdded: { increment: delta } },
      create: { userId, date, saves: 1, charsAdded: delta },
    });
  }
  return true;
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
