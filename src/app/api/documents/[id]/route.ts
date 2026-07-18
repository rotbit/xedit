import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { snapshot, IDLE_VERSION_MS } from "@/lib/versions";

type Params = { params: Promise<{ id: string }> };

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function PUT(req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // 从回收站恢复
  if (body?.restore === true) {
    const restored = await prisma.document.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (restored.count === 0) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  const data: { title?: string; content?: string; category?: string } = {};
  if (typeof body.title === "string") data.title = body.title.slice(0, 200) || "未命名文章";
  if (typeof body.content === "string") data.content = body.content;
  if (typeof body.category === "string") {
    data.category = body.category.trim().slice(0, 50) || "未分类";
  }

  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  await prisma.document.update({ where: { id }, data });

  // 距上次保存超过空闲阈值才再次改动，说明上一段编辑已结束——
  // 把当时的最终内容定格为一个版本（前端定时器的服务端兜底）
  if (typeof data.content === "string" && data.content !== existing.content) {
    const idleMs = Date.now() - existing.updatedAt.getTime();
    if (idleMs >= IDLE_VERSION_MS) {
      await snapshot(id, existing.title, existing.content, "auto");
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const hard = new URL(req.url).searchParams.get("hard") === "1";

  const result = hard
    ? await prisma.document.deleteMany({ where: { id, userId } })
    : await prisma.document.updateMany({
        where: { id, userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
  if (result.count === 0) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
