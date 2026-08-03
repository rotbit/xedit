import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { encryptSecret, decryptSecret, keyLast4 } from "@/lib/ai/crypto";

export const runtime = "nodejs";

/** 掩码：前端「不改动 App Secret」时回传的哨兵值（与 AI 设置同款约定） */
const KEY_MASK = "__keep__";

async function buildView(userId: string) {
  const conn = await prisma.feishuConnection.findUnique({ where: { userId } });
  const secret = decryptSecret(conn?.appSecretEnc ?? "");
  return {
    hasApp: Boolean(conn?.appId && secret),
    appId: conn?.appId ?? "",
    secretLast4: keyLast4(secret),
    connected: Boolean(conn?.accessTokenEnc || conn?.refreshTokenEnc),
    feishuName: conn?.feishuName ?? "",
    spaceId: conn?.spaceId ?? "",
    spaceName: conn?.spaceName ?? "",
    lastSyncAt: conn?.lastSyncAt?.toISOString() ?? null,
  };
}

/** 飞书连接状态：设置对话框的数据源 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json(await buildView(session.user.id));
}

/** 保存账号自己的飞书应用凭证；换了 App ID 则旧授权一并作废 */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const appId = typeof body.appId === "string" ? body.appId.trim().slice(0, 64) : "";
  if (!appId) {
    return NextResponse.json({ error: "App ID 不能为空" }, { status: 400 });
  }

  const existing = await prisma.feishuConnection.findUnique({ where: { userId } });
  const data: {
    appId: string;
    appSecretEnc?: string;
    accessTokenEnc?: string;
    refreshTokenEnc?: string;
    feishuOpenId?: string;
    feishuName?: string;
    scopes?: string;
  } = { appId };
  // Secret：缺省/掩码 → 保留原值；有值 → 加密覆盖
  if (typeof body.appSecret === "string" && body.appSecret !== KEY_MASK) {
    data.appSecretEnc = encryptSecret(body.appSecret.trim());
  }
  // 应用换了，旧应用签发的 token 不再可用，连带授权一起清掉
  if (existing && existing.appId !== appId) {
    data.accessTokenEnc = "";
    data.refreshTokenEnc = "";
    data.feishuOpenId = "";
    data.feishuName = "";
    data.scopes = "";
  }
  await prisma.feishuConnection.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
  return NextResponse.json(await buildView(userId));
}

/** 断开授权：只清 token，应用凭证与同步映射保留——重连一键完成、不会重复建档 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  await prisma.feishuConnection.updateMany({
    where: { userId: session.user.id },
    data: { accessTokenEnc: "", refreshTokenEnc: "", feishuOpenId: "", feishuName: "", scopes: "" },
  });
  return NextResponse.json({ ok: true });
}
