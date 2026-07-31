import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { snapshot, autoSnapshot, IDLE_RULE } from "@/lib/versions";
import { wordCount } from "@/lib/wordCount";

type Params = { params: Promise<{ id: string }> };

async function ownedDoc(id: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.document.findFirst({ where: { id, userId: session.user.id } });
}

/** 版本列表（不含正文，附字数便于展示） */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });

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
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });
  const denied = await readOnlyGuard(doc.userId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  // auto 来自前端的停笔 / 关页面兜底，要节流；manual 是用户明确点了「存档」，只去重
  const created =
    body?.kind === "auto"
      ? await autoSnapshot(id, doc.title, doc.content, IDLE_RULE)
      : await snapshot(id, doc.title, doc.content, "manual");
  return NextResponse.json({ created });
}
