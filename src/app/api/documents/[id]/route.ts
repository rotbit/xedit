import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { autoSnapshot, AUTOSAVE_RULE } from "@/lib/versions";

/** 东八区日期串 YYYY-MM-DD */
function chinaDate(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

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
    data.category = body.category.trim().slice(0, 100) || "未分类";
  }

  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  await prisma.document.update({ where: { id }, data });

  // 自动保存本身也留版：首存先留个底，之后每隔一段时间把当前内容定格一版
  // （前端空闲定时器只在页面开着时才有效，这里才是真正的兜底）
  if (typeof data.content === "string" && data.content !== existing.content) {
    await autoSnapshot(id, data.title ?? existing.title, data.content, AUTOSAVE_RULE);
    // 每日写作流水：保存次数 + 净增字数（删减不计负）
    const delta = Math.max(
      0,
      data.content.replace(/\s/g, "").length - existing.content.replace(/\s/g, "").length
    );
    const date = chinaDate();
    await prisma.writingActivity.upsert({
      where: { userId_date: { userId, date } },
      update: { saves: { increment: 1 }, charsAdded: { increment: delta } },
      create: { userId, date, saves: 1, charsAdded: delta },
    });
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
