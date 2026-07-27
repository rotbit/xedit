import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { ossConfigured, ossDelete } from "@/lib/oss";

type Params = { params: Promise<{ id: string }> };

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
