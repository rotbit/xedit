import { useStore } from "@/store/useStore";

/** AI 是否已配置（Key 或本地 Ollama） */
export function aiReady(): boolean {
  const s = useStore.getState();
  return Boolean(s.aiApiKey || s.aiBaseUrl.includes("localhost"));
}

interface ChatOptions {
  system?: string;
  prompt: string;
  onDelta?: (fullText: string) => void;
  signal?: AbortSignal;
}

function aiBody(extra: Record<string, unknown>) {
  const s = useStore.getState();
  return JSON.stringify({
    baseUrl: s.aiBaseUrl,
    apiKey: s.aiApiKey,
    model: s.aiModel,
    ...extra,
  });
}

/** 非流式对话 */
export async function chatOnce(opts: ChatOptions): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: aiBody({ system: opts.system, prompt: opts.prompt }),
    signal: opts.signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.text as string;
}

/** 流式对话，onDelta 收到累计文本 */
export async function streamChat(opts: ChatOptions): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: aiBody({ system: opts.system, prompt: opts.prompt, stream: true }),
    signal: opts.signal,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !res.body || !contentType.includes("event-stream")) {
    const data = await res.json().catch(() => ({}));
    if (data.error) throw new Error(data.error);
    if (typeof data.text === "string") return data.text;
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          opts.onDelta?.(full);
        }
      } catch {
        // 跳过无法解析的行
      }
    }
  }
  if (!full.trim()) throw new Error("AI 未返回内容");
  return full;
}
