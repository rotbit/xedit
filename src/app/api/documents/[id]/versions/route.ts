import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { snapshot } from "@/lib/versions";

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
      chars: v.content.replace(/\s/g, "").length,
    }))
  );
}

/** 存档当前内容（手动，或前端空闲定时器触发的 auto） */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind === "auto" ? "auto" : "manual";
  const created = await snapshot(id, doc.title, doc.content, kind);
  return NextResponse.json({ created });
}
