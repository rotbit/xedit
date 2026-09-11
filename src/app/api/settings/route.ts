import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { sanitizeCustomThemes } from "@/lib/themes/custom";

/** 侧栏手动排序：{ items: { 父路径: [`c:子名` | `d:文档id`…] } } 是当前写入的混排序列，
 *  cats/docs 是老版本的两份独立序列（父路径→子名 / 分类→文档id），仍收下以免旧端回写时丢数据。
 *  只收字符串数组的映射，条目与总量都设上限，返回序列化结果；不合法返回 null */
function sanitizeSidebarOrder(raw: unknown): string | null {
  const pickMap = (v: unknown): Record<string, string[]> => {
    if (!v || typeof v !== "object") return {};
    const out: Record<string, string[]> = {};
    let entries = 0;
    for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
      if (entries >= 500 || typeof k !== "string" || k.length > 100 || !Array.isArray(list)) {
        continue;
      }
      out[k] = list
        .filter((s): s is string => typeof s === "string" && s.length <= 100)
        .slice(0, 500);
      entries++;
    }
    return out;
  };
  const obj = raw as { items?: unknown; cats?: unknown; docs?: unknown };
  const clean = JSON.stringify({
    items: pickMap(obj.items),
    cats: pickMap(obj.cats),
    docs: pickMap(obj.docs),
  });
  return clean.length <= 256 * 1024 ? clean : null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const denied = await readOnlyGuard(session.user.id);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | boolean> = {};
  if (typeof body.themeId === "string") data.themeId = body.themeId;
  if (typeof body.codeThemeId === "string") data.codeThemeId = body.codeThemeId;
  if (typeof body.customCss === "string") data.customCss = body.customCss;
  if (typeof body.macCode === "boolean") data.macCode = body.macCode;
  if (typeof body.linkFootnote === "boolean") data.linkFootnote = body.linkFootnote;
  if (Array.isArray(body.customThemes)) {
    data.customThemes = JSON.stringify(sanitizeCustomThemes(body.customThemes));
  }
  if (Array.isArray(body.categories)) {
    // 上限与文档分类字段对齐（100 字符）：此前截 50 会把飞书导入的深路径截成幻影分类
    const list = body.categories
      .filter((c: unknown): c is string => typeof c === "string" && Boolean(c.trim()))
      .map((c: string) => c.trim().slice(0, 100))
      .slice(0, 400);
    data.categories = JSON.stringify(Array.from(new Set(list)));
  }
  if (body.sidebarOrder && typeof body.sidebarOrder === "object") {
    const clean = sanitizeSidebarOrder(body.sidebarOrder);
    if (clean) data.sidebarOrder = clean;
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  });
  return NextResponse.json(settings);
}
