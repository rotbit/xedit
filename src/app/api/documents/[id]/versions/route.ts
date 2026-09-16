import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireOwnedDoc, requireUserId } from "@/lib/routeAuth";
import { snapshot, autoSnapshot, IDLE_RULE } from "@/lib/versions";
import { wordCount } from "@/lib/wordCount";

type Params = { params: Promise<{ id: string }> };

/** 版本列表（不含正文，附字数便于展示） */
export async function GET(_req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const { id } = await params;
  // 列版本只要确认这篇归你，文档本身的字段一个都用不上
  const doc = await requireOwnedDoc(id, userId);
  if (isResponse(doc)) return doc;

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, kind: true, createdAt: true, content: true },
  });
  return NextResponse.json(
    versions.map((v) => ({
      id: v.id,
      title: v.title,
      kind: v.kind,
      createdAt: v.createdAt,
      chars: wordCount(v.content),
    }))
  );
}

/** 存档当前内容（手动，或前端空闲定时器触发的 auto） */
export async function POST(req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const { id } = await params;
  // 存档要把当前标题与正文定格下来，这两个字段得取
  const doc = await requireOwnedDoc(id, userId, {
    select: { id: true, title: true, content: true },
  });
  if (isResponse(doc)) return doc;

  const body = await req.json().catch(() => ({}));
  // auto 来自前端的停笔 / 关页面兜底，要节流；manual 是用户明确点了「存档」，只去重
  const created =
    body?.kind === "auto"
      ? await autoSnapshot(id, doc.title, doc.content, IDLE_RULE)
      : await snapshot(id, doc.title, doc.content, "manual");
  return NextResponse.json({ created });
}
