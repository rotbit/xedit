import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireUserId } from "@/lib/routeAuth";
import { touchDailyActive } from "@/lib/active";
import { deleteDocument, updateDocument } from "@/lib/documents";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  // 直接打开 /edit/[id] 不经过文档列表，这里补一个 DAU 打点位
  void touchDailyActive(userId);
  const { id } = await params;

  // 带 since= 的是「已有镜像、只想知道云端有没有更新」的后台校新：
  // 先用轻量 select 比一次时间戳，没变就 204 收场，整篇正文不必白下一趟。
  // 不带（或时间串没法解析）时一切照旧，冷路径装载与其它调用方不受影响。
  const since = new URL(req.url).searchParams.get("since");
  const sinceAt = since ? new Date(since) : null;
  if (sinceAt && !Number.isNaN(sinceAt.getTime())) {
    const head = await prisma.document.findFirst({
      where: { id, userId },
      select: { updatedAt: true, deletedAt: true },
    });
    if (!head || head.deletedAt) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }
    if (head.updatedAt.getTime() <= sinceAt.getTime()) {
      return new Response(null, { status: 204 });
    }
  }

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
  // 回传服务端时间：客户端镜像据此记 updatedAt，本机时钟偏差就不会影响之后的新旧比较
  return NextResponse.json({ ok: true, updatedAt: saved.updatedAt.toISOString() });
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
