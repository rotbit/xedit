import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | boolean> = {};
  if (typeof body.themeId === "string") data.themeId = body.themeId;
  if (typeof body.codeThemeId === "string") data.codeThemeId = body.codeThemeId;
  if (typeof body.customCss === "string") data.customCss = body.customCss;
  if (typeof body.macCode === "boolean") data.macCode = body.macCode;
  if (typeof body.linkFootnote === "boolean") data.linkFootnote = body.linkFootnote;
  if (Array.isArray(body.categories)) {
    const list = body.categories
      .filter((c: unknown): c is string => typeof c === "string" && Boolean(c.trim()))
      .map((c: string) => c.trim().slice(0, 50))
      .slice(0, 100);
    data.categories = JSON.stringify(Array.from(new Set(list)));
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  });
  return NextResponse.json(settings);
}
