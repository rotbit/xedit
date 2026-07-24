import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret, keyLast4 } from "@/lib/ai/crypto";
import { isProviderId } from "@/lib/ai/catalog";

export const runtime = "nodejs";

/** 掩码：前端「不改动密钥」时回传的哨兵值，服务端识别后保留原密钥 */
const KEY_MASK = "__keep__";

interface ProviderView {
  hasKey: boolean;
  keyLast4: string;
  baseUrl: string;
  chatModel: string;
  imageModel: string;
}

async function buildConfig(userId: string) {
  const [rows, settings] = await Promise.all([
    prisma.aiProvider.findMany({ where: { userId } }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ]);
  const providers: Record<string, ProviderView> = {};
  for (const row of rows) {
    const key = decryptSecret(row.apiKeyEnc);
    providers[row.provider] = {
      hasKey: Boolean(key),
      keyLast4: keyLast4(key),
      baseUrl: row.baseUrl,
      chatModel: row.chatModel,
      imageModel: row.imageModel,
    };
  }
  return {
    providers,
    activeChat: settings?.aiChatProvider ?? "",
    activeImage: settings?.aiImageProvider ?? "",
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json(await buildConfig(session.user.id));
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));

  // 1) 更新某个平台的配置
  if (typeof body.provider === "string") {
    if (!isProviderId(body.provider)) {
      return NextResponse.json({ error: "未知平台" }, { status: 400 });
    }
    const provider = body.provider;
    const data: {
      baseUrl?: string;
      chatModel?: string;
      imageModel?: string;
      apiKeyEnc?: string;
    } = {};

    if (typeof body.baseUrl === "string") data.baseUrl = body.baseUrl.trim().slice(0, 200);
    if (typeof body.chatModel === "string") data.chatModel = body.chatModel.trim().slice(0, 120);
    if (typeof body.imageModel === "string") data.imageModel = body.imageModel.trim().slice(0, 120);
    // apiKey：缺省/掩码 → 保留原值；有值 → 加密覆盖
    if (typeof body.apiKey === "string" && body.apiKey !== KEY_MASK) {
      data.apiKeyEnc = encryptSecret(body.apiKey.trim());
    }

    await prisma.aiProvider.upsert({
      where: { userId_provider: { userId, provider } },
      update: data,
      create: { userId, provider, ...data },
    });
  }

  // 2) 更新当前启用的平台（文本 / 生图）
  const settingsUpdate: { aiChatProvider?: string; aiImageProvider?: string } = {};
  if (typeof body.activeChat === "string" && (body.activeChat === "" || isProviderId(body.activeChat))) {
    settingsUpdate.aiChatProvider = body.activeChat;
  }
  if (typeof body.activeImage === "string" && (body.activeImage === "" || isProviderId(body.activeImage))) {
    settingsUpdate.aiImageProvider = body.activeImage;
  }
  if (Object.keys(settingsUpdate).length) {
    await prisma.userSettings.upsert({
      where: { userId },
      update: settingsUpdate,
      create: { userId, ...settingsUpdate },
    });
  }

  return NextResponse.json(await buildConfig(userId));
}
