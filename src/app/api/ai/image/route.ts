import { NextResponse } from "next/server";
import { ossConfigured, ossPut } from "@/lib/oss";

export const maxDuration = 180;

/**
 * OpenAI 兼容图片生成代理。
 * 返回 b64 时若已配置 OSS 则转存图床（公众号需要可访问的图片 URL）。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const baseUrl: string = typeof body?.baseUrl === "string" ? body.baseUrl.replace(/\/$/, "") : "";
  const apiKey: string = typeof body?.apiKey === "string" ? body.apiKey : "";
  const model: string = typeof body?.model === "string" ? body.model : "";
  const prompt: string = typeof body?.prompt === "string" ? body.prompt : "";
  const size: string = ["1024x1024", "1536x1024", "1024x1536"].includes(body?.size)
    ? body.size
    : "1024x1024";

  if (!/^https?:\/\//.test(baseUrl)) {
    return NextResponse.json({ error: "AI 接口地址无效，请先在「AI 设置」中配置" }, { status: 400 });
  }
  if (!model || !prompt) {
    return NextResponse.json({ error: "缺少 model 或图片描述" }, { status: 400 });
  }

  try {
    const res = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, prompt, n: 1, size }),
      signal: AbortSignal.timeout(170_000),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error?.message ?? `上游返回 ${res.status}`;
      return NextResponse.json({ error: `生成失败：${message}` }, { status: 502 });
    }

    const item = data?.data?.[0];
    if (item?.url) {
      return NextResponse.json({ url: item.url });
    }
    if (item?.b64_json) {
      if (!ossConfigured()) {
        return NextResponse.json(
          { error: "该模型返回 base64 图片，需要配置阿里云 OSS 图床后才能使用" },
          { status: 501 }
        );
      }
      const buffer = Buffer.from(item.b64_json, "base64");
      const url = await ossPut(buffer, "png", "image/png");
      return NextResponse.json({ url });
    }
    return NextResponse.json({ error: "AI 未返回图片" }, { status: 502 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "网络错误";
    return NextResponse.json({ error: `生成失败：${message}` }, { status: 502 });
  }
}
