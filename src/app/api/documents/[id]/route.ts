import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireUserId } from "@/lib/routeAuth";
import { touchDailyActive } from "@/lib/active";
import { deleteDocument, updateDocument } from "@/lib/documents";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  // 直接打开 /edit/[id] 不经过文档列表，这里补一个 DAU 打点位
  void touchDailyActive(userId);
  const { id } = await params;
  // 编辑器要整行（正文、时间戳都在响应里），这里不走 requireOwnedDoc 的轻量 select
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function PUT(req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
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

  // 保存的副作用（字段裁剪、自动留版、当日写作流水，以及回收站里的文章不给改写）
  // 全在服务层；MCP 的 update_document 走的也是这一条，两条通道语义不会漂
  const saved = await updateDocument(userId, id, {
    title: body.title,
    content: body.content,
    category: body.category,
  });
  if (!saved) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const { id } = await params;
  const hard = new URL(req.url).searchParams.get("hard") === "1";

  const removed = await deleteDocument(userId, id, hard);
  if (!removed) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
