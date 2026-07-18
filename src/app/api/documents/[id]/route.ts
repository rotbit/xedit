import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { maybeSnapshot } from "@/lib/versions";

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
  if (!doc) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PUT(req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { title?: string; content?: string } = {};
  if (typeof body.title === "string") data.title = body.title.slice(0, 200) || "未命名文章";
  if (typeof body.content === "string") data.content = body.content;

  const result = await prisma.document.updateMany({ where: { id, userId }, data });
  if (result.count === 0) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  // 自动保存的同时按间隔留存版本快照
  if (typeof data.content === "string") {
    await maybeSnapshot(id, data.title ?? "未命名文章", data.content);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const result = await prisma.document.deleteMany({ where: { id, userId } });
  if (result.count === 0) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
