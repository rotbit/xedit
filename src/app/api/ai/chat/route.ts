import { NextResponse } from "next/server";

export const maxDuration = 120;

/**
 * OpenAI 兼容 chat 代理。
 * Key 由用户在前端「AI 设置」中配置、随请求携带，服务端不落盘，仅做转发以规避浏览器 CORS。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const baseUrl: string = typeof body?.baseUrl === "string" ? body.baseUrl.replace(/\/$/, "") : "";
  const apiKey: string = typeof body?.apiKey === "string" ? body.apiKey : "";
  const model: string = typeof body?.model === "string" ? body.model : "";
  const system: string = typeof body?.system === "string" ? body.system : "";
  const prompt: string = typeof body?.prompt === "string" ? body.prompt : "";

  if (!/^https?:\/\//.test(baseUrl)) {
    return NextResponse.json({ error: "AI 接口地址无效，请先在「AI 设置」中配置" }, { status: 400 });
  }
  if (!model || !prompt) {
    return NextResponse.json({ error: "缺少 model 或内容" }, { status: 400 });
  }

  const wantStream = body?.stream === true;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
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
      // 直接透传上游 SSE
      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error?.message ?? `上游返回 ${res.status}`;
      return NextResponse.json({ error: `AI 调用失败：${message}` }, { status: 502 });
    }
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) {
      return NextResponse.json({ error: "AI 未返回内容" }, { status: 502 });
    }
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "网络错误";
    return NextResponse.json({ error: `AI 调用失败：${message}` }, { status: 502 });
  }
}
