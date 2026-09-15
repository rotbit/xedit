import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId } from "@/lib/admin";
import { ossConfigured, ossList, ossUrlOf } from "@/lib/oss";
import { MIME_BY_EXT } from "@/lib/media";

/**
 * 素材列表。kind/q 是普通的 where 收窄，filter=unused 则不同：
 * 判定口径与 [id]/usage 一致——都按对象 key 在正文里做子串匹配（换 CDN 域名后旧链接也命中），
 * 改一处记得改另一处。区别是 usage 单个素材走 DB 的 contains，这里要判全部素材：
 * 引用关系没有单独的表（正文就是一整段 Markdown/HTML），只能把该用户的全部正文与
 * 全部素材都拉进内存做子串匹配，代价是 素材数 × 正文总长。单用户量级（素材几百条、
 * 正文合计几 MB）下这是毫秒级，换来的是不必为图片库另建一张引用索引表；
 * 真到了需要分页的体量，再补一张 key → documentId 的引用表替换掉这段。
 */

/** 未被引用列表一次最多返回多少条：够翻一屏清理，也挡住极端账号把响应撑爆 */
const UNUSED_MAX_ITEMS = 500;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const q = (searchParams.get("q") ?? "").trim();
  const where: Prisma.AssetWhereInput = {
    userId,
    // 图/视频按 mime 前缀分，未识别的 kind 当没传
    ...(kind === "image" || kind === "video" ? { mime: { startsWith: `${kind}/` } } : {}),
    ...(q ? { key: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const limitParam = searchParams.get("limit");

  // 未被引用：全量比对后一次性返回，不分页（cursor 分页对内存过滤没意义）。
  // 这是新参数，没有旧调用方，所以不论有没有带 limit 都按 { items, total, nextCursor } 返回
  if (searchParams.get("filter") === "unused") {
    const [docs, assets] = await Promise.all([
      // 回收站里的文章也算引用：删过的文章可能被恢复，素材先留着更稳妥
      prisma.document.findMany({ where: { userId }, select: { content: true } }),
      prisma.asset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ]);
    const contents = docs.map((d) => d.content);
    const unused = assets.filter((a) => !contents.some((c) => c.includes(a.key)));
    return NextResponse.json({
      items: unused.slice(0, UNUSED_MAX_ITEMS),
      total: unused.length,
      nextCursor: null,
    });
  }

  // 不带 limit 保持旧的全量数组形态，桌面端等旧调用方不受影响
  if (!limitParam) {
    const assets = await prisma.asset.findMany({ where, orderBy: { createdAt: "desc" } });
    return NextResponse.json(assets);
  }
  const limit = Math.min(Math.max(Number(limitParam) || 24, 1), 100);
  const cursor = searchParams.get("cursor");
  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      // createdAt 可能同秒重复，补 id 兜底保证 cursor 顺序稳定
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.asset.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({
    items,
    total,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

/** 同步 OSS 历史文件：把 xedit/ 前缀下未入库的对象补录到当前账号。
 *  会把整个 bucket 的无主对象认领到调用者名下，多用户下等于越权 + 绕配额，
 *  因此只对超级管理员开放（单用户时代的数据迁移工具）。 */
export async function POST() {
  const session = await auth();
  const userId = adminSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "仅管理员可同步 OSS 历史文件" }, { status: 403 });
  }
  if (!ossConfigured()) {
    return NextResponse.json({ error: "服务端未配置 OSS" }, { status: 501 });
  }
  const [objects, existing] = await Promise.all([
    ossList(),
    prisma.asset.findMany({ where: { userId }, select: { key: true } }),
  ]);
  const known = new Set(existing.map((e) => e.key));
  const mimeOf = (key: string): string =>
    MIME_BY_EXT[key.split(".").pop()?.toLowerCase() ?? ""] ?? "";
  const fresh = objects.filter((o) => !known.has(o.key) && mimeOf(o.key));
  if (fresh.length > 0) {
    await prisma.asset.createMany({
      data: fresh.map((o) => ({
        userId,
        key: o.key,
        url: ossUrlOf(o.key),
        size: o.size,
        mime: mimeOf(o.key),
        source: "upload",
      })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({ added: fresh.length });
}
