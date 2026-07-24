import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveConfig } from "@/lib/ai/server";
import { replicateChatOnce, replicateChatStream } from "@/lib/ai/replicate";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 文本对话代理。使用当前登录用户在「AI 设置」里启用的平台与密钥（服务端解密，不经浏览器）。
 * - replicate：走原生适配，流式输出归一成 OpenAI SSE。
 * - openai 兼容（kimi/glm/deepseek 官方等）：透传到 /chat/completions。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录后再使用 AI 功能" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const system: string = typeof body?.system === "string" ? body.system : "";
  const prompt: string = typeof body?.prompt === "string" ? body.prompt : "";
  const wantStream = body?.stream === true;
  if (!prompt) {
    return NextResponse.json({ error: "缺少内容" }, { status: 400 });
  }

  const cfg = await getActiveConfig(session.user.id, "chat");
  if (!cfg) {
    return NextResponse.json({ error: "尚未启用 AI 平台，请先在「AI 设置」中配置" }, { status: 400 });
  }
  if (!cfg.token) {
    return NextResponse.json({ error: `请先在「AI 设置」中填写 ${cfg.meta.label} 的密钥` }, { status: 400 });
  }
  if (!cfg.model) {
    return NextResponse.json({ error: "未选择文本模型" }, { status: 400 });
  }

  try {
    if (cfg.meta.kind === "replicate") {
      if (wantStream) {
        const stream = await replicateChatStream({
          model: cfg.model,
          token: cfg.token,
          system,
          prompt,
          baseUrl: cfg.baseUrl,
          signal: AbortSignal.timeout(115_000),
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
        });
      }
      const text = await replicateChatOnce({
        model: cfg.model,
        token: cfg.token,
        system,
        prompt,
        baseUrl: cfg.baseUrl,
        signal: AbortSignal.timeout(115_000),
      });
      if (!text) return NextResponse.json({ error: "AI 未返回内容" }, { status: 502 });
      return NextResponse.json({ text });
    }

    // OpenAI 兼容路径
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        ...(wantStream ? { stream: true } : {}),
      }),
      signal: AbortSignal.timeout(110_000),
    });

    if (wantStream) {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        const message = err?.error?.message ?? `上游返回 ${res.status}`;
        return NextResponse.json({ error: `AI 调用失败：${message}` }, { status: 502 });
      }
      return new Response(res.body, {
        headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error?.message ?? `上游返回 ${res.status}`;
      return NextResponse.json({ error: `AI 调用失败：${message}` }, { status: 502 });
    }
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) return NextResponse.json({ error: "AI 未返回内容" }, { status: 502 });
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "网络错误";
    return NextResponse.json({ error: `AI 调用失败：${message}` }, { status: 502 });
  }
}
