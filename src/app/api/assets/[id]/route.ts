import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { ossConfigured, ossDelete } from "@/lib/oss";
import { parseImageDimensions } from "@/lib/media";

type Params = { params: Promise<{ id: string }> };

/**
 * 补录像素尺寸：服务端上传路径（MCP / 飞书导入 / OSS 历史同步）入库时没有尺寸，
 * 前端在图片库首次把图片解码出来后回填一次。
 * 只写空着的记录——已有值就当前端在重复回填，返回 204 不动，避免客户端反复改写。
 *
 * 故意不加 readOnlyGuard：补录的是展示用的元数据（图片库要按尺寸排版），
 * 不是用户内容；被封成只读的账号照样要能正常浏览图片库。
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const dims = parseImageDimensions(body?.width, body?.height);
  if (!dims) return NextResponse.json({ error: "尺寸不合法" }, { status: 400 });
  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, width: true },
  });
  if (!asset) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  if (asset.width !== null) return new NextResponse(null, { status: 204 });
  await prisma.asset.update({ where: { id: asset.id }, data: dims });
  return NextResponse.json({ ok: true, ...dims });
}

/** 删除图片：先删 OSS 对象，再删索引 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const denied = await readOnlyGuard(session.user.id);
  if (denied) return denied;
  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!asset) return NextResponse.json({ error: "图片不存在" }, { status: 404 });

  if (ossConfigured()) {
    try {
      await ossDelete(asset.key);
    } catch {
      // OSS 删除失败不阻断索引清理（对象可能已不存在）
    }
  }
  await prisma.asset.delete({ where: { id: asset.id } });
  return NextResponse.json({ ok: true });
}
