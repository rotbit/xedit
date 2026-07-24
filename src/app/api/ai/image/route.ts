import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveConfig, persistImage } from "@/lib/ai/server";
import { replicateImageUrl } from "@/lib/ai/replicate";

export const runtime = "nodejs";
export const maxDuration = 180;

const SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
/** 尺寸 → Replicate 的 aspect_ratio */
const ASPECT: Record<string, string> = {
  "1024x1024": "1:1",
  "1536x1024": "3:2",
  "1024x1536": "2:3",
};

/**
 * AI 生图代理。使用当前登录用户启用的「生图平台」（replicate / 智谱）。
 * 生成结果统一转存 OSS 图床，得到公众号可用的稳定 URL。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录后再使用 AI 功能" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const prompt: string = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const size: string = SIZES.includes(body?.size) ? body.size : "1024x1024";
  if (!prompt) {
    return NextResponse.json({ error: "缺少图片描述" }, { status: 400 });
  }

  const cfg = await getActiveConfig(session.user.id, "image");
  if (!cfg) {
    return NextResponse.json({ error: "尚未启用生图平台，请先在「AI 设置」中配置" }, { status: 400 });
  }
  if (!cfg.token) {
    return NextResponse.json({ error: `请先在「AI 设置」中填写 ${cfg.meta.label} 的密钥` }, { status: 400 });
  }
  if (!cfg.model) {
    return NextResponse.json({ error: "未选择图片模型" }, { status: 400 });
  }

  try {
    if (cfg.meta.kind === "replicate") {
      const url = await replicateImageUrl({
        model: cfg.model,
        token: cfg.token,
        prompt,
        aspectRatio: ASPECT[size],
        baseUrl: cfg.baseUrl,
        signal: AbortSignal.timeout(170_000),
      });
      return NextResponse.json({ url: await persistImage(session.user.id, { url }) });
    }

    // OpenAI 兼容生图（智谱 CogView 等）
    const res = await fetch(`${cfg.baseUrl}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ model: cfg.model, prompt, n: 1, size }),
      signal: AbortSignal.timeout(170_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error?.message ?? `上游返回 ${res.status}`;
      return NextResponse.json({ error: `生成失败：${message}` }, { status: 502 });
    }
    const item = data?.data?.[0];
    if (item?.url) {
      return NextResponse.json({ url: await persistImage(session.user.id, { url: item.url }) });
    }
    if (item?.b64_json) {
      return NextResponse.json({ url: await persistImage(session.user.id, { b64: item.b64_json }) });
    }
    return NextResponse.json({ error: "AI 未返回图片" }, { status: 502 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "网络错误";
    return NextResponse.json({ error: `生成失败：${message}` }, { status: 502 });
  }
}
