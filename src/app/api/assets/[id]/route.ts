import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { ossConfigured, ossDelete } from "@/lib/oss";
import { parseImageDimensions } from "@/lib/media";
import { tk } from "@/i18n/t";

type Params = { params: Promise<{ id: string }> };

/**
 * Backfill pixel dimensions: server-side upload paths (MCP / Feishu import / OSS history sync) store no dimensions,
 * so the frontend backfills them once after the image library first decodes the image.
 * Only writes empty records: an existing value means a duplicate backfill, so return 204 untouched to stop clients rewriting it repeatedly.
 *
 * Deliberately no readOnlyGuard: this backfills display metadata (the image library lays out by size),
 * not user content; read-only-banned accounts must still be able to browse the image library normally.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const dims = parseImageDimensions(body?.width, body?.height);
  if (!dims) return NextResponse.json({ error: tk("尺寸不合法") }, { status: 400 });
  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, width: true },
  });
  if (!asset) return NextResponse.json({ error: tk("图片不存在") }, { status: 404 });
  if (asset.width !== null) return new NextResponse(null, { status: 204 });
  await prisma.asset.update({ where: { id: asset.id }, data: dims });
  return NextResponse.json({ ok: true, ...dims });
}

/** Delete an image: delete the OSS object first, then the index */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const denied = await readOnlyGuard(session.user.id);
  if (denied) return denied;
  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!asset) return NextResponse.json({ error: tk("图片不存在") }, { status: 404 });

  if (ossConfigured()) {
    try {
      await ossDelete(asset.key);
    } catch {
      // An OSS delete failure doesn't block index cleanup (the object may already be gone)
    }
  }
  await prisma.asset.delete({ where: { id: asset.id } });
  return NextResponse.json({ ok: true });
}
