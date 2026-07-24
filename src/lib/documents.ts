import { prisma } from "@/lib/prisma";
import { autoSnapshot, AUTOSAVE_RULE } from "@/lib/versions";

/**
 * 文档增删改查的共享服务层：REST 路由与 MCP 工具共用同一套逻辑，避免行为漂移。
 * 所有操作都以 userId 隔离，跨用户不可见、不可改。
 */

/** 东八区日期串 YYYY-MM-DD（与 REST 路由一致） */
function chinaDate(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Markdown 转纯文本摘要（去代码块、图片、链接语法与标记符） */
function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`~$|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 非空白字数 */
function charCount(s: string): number {
  return s.replace(/\s/g, "").length;
}

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

export async function listDocuments(
  userId: string,
  opts: { trash?: boolean; category?: string; limit?: number } = {}
): Promise<DocSummary[]> {
  const docs = await prisma.document.findMany({
    where: {
      userId,
      deletedAt: opts.trash ? { not: null } : null,
      ...(opts.category ? { category: opts.category } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: clampLimit(opts.limit, 50, 200),
    select: { id: true, title: true, category: true, updatedAt: true, content: true },
  });
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    updatedAt: d.updatedAt,
    excerpt: plainText(d.content).slice(0, 120),
    chars: charCount(d.content),
  }));
}

/** 在匹配位置附近截取一小段上下文，帮助定位命中 */
function snippetAround(text: string, query: string): string {
  const plain = plainText(text);
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return plain.slice(0, 120);
  const start = Math.max(0, idx - 40);
  return (start > 0 ? "…" : "") + plain.slice(start, start + 120);
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
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    updatedAt: d.updatedAt,
    excerpt: snippetAround(d.content, q),
    chars: charCount(d.content),
  }));
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
      title: input.title && input.title.trim() ? input.title.slice(0, 200) : "未命名文章",
      content: typeof input.content === "string" ? input.content : "",
      category:
        input.category && input.category.trim()
          ? input.category.trim().slice(0, 100)
          : "未分类",
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
  if (typeof input.title === "string") data.title = input.title.slice(0, 200) || "未命名文章";
  if (typeof input.content === "string") data.content = input.content;
  if (typeof input.category === "string") {
    data.category = input.category.trim().slice(0, 100) || "未分类";
  }
  await prisma.document.update({ where: { id }, data });

  if (typeof data.content === "string" && data.content !== existing.content) {
    await autoSnapshot(id, data.title ?? existing.title, data.content, AUTOSAVE_RULE);
    const delta = Math.max(0, charCount(data.content) - charCount(existing.content));
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
