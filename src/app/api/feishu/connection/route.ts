import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { encryptSecret, decryptSecret, keyLast4 } from "@/lib/ai/crypto";
import { tk } from "@/i18n/t";

export const runtime = "nodejs";

/** Mask: sentinel the frontend sends back to mean "leave App Secret unchanged" */
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

/** Feishu connection status: data source for the settings dialog */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  return NextResponse.json(await buildView(session.user.id));
}

/** Save the account's own Feishu app credentials; changing App ID invalidates the old authorization too */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const userId = session.user.id;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const appId = typeof body.appId === "string" ? body.appId.trim().slice(0, 64) : "";
  if (!appId) {
    return NextResponse.json({ error: tk("App ID 不能为空") }, { status: 400 });
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
  // Secret: missing/mask → keep the existing value; a value → encrypt and overwrite
  if (typeof body.appSecret === "string" && body.appSecret !== KEY_MASK) {
    data.appSecretEnc = encryptSecret(body.appSecret.trim());
  }
  // The app changed, so tokens issued by the old app are unusable; clear the authorization along with them
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

/** Disconnect: clear only the token, keeping app credentials and sync mappings, so reconnecting is one click and no duplicate docs are created */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  // Clearing the token is also a write, so read-only bans must block it too (same guard as PUT)
  const denied = await readOnlyGuard(session.user.id);
  if (denied) return denied;
  await prisma.feishuConnection.updateMany({
    where: { userId: session.user.id },
    data: { accessTokenEnc: "", refreshTokenEnc: "", feishuOpenId: "", feishuName: "", scopes: "" },
  });
  return NextResponse.json({ ok: true });
}
