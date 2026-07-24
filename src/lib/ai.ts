import { useStore } from "@/store/useStore";

/** 文本 AI 是否可用（当前账号已启用平台并配置了密钥） */
export function aiReady(): boolean {
  return useStore.getState().aiChatReady;
}

/** 生图 AI 是否可用 */
export function aiImageReady(): boolean {
  return useStore.getState().aiImageReady;
}

/**
 * 从服务端拉取当前账号的 AI 配置，刷新「是否可用」标记。
 * 未登录（401）或出错时视为不可用。应在应用启动、以及保存 AI 设置后调用。
 */
export async function refreshAiStatus(): Promise<void> {
  try {
    const res = await fetch("/api/ai/providers");
    if (!res.ok) {
      useStore.getState().setAiStatus({ aiChatReady: false, aiImageReady: false });
      return;
    }
    const data = await res.json();
    // 文本对话与生图各一套配置：启用的平台自身填了密钥才算可用
    const ready = (scope: { active?: string; providers?: Record<string, { hasKey?: boolean }> }) =>
      Boolean(scope?.active && scope.providers?.[scope.active]?.hasKey);
    useStore.getState().setAiStatus({
      aiChatReady: ready(data?.chat),
      aiImageReady: ready(data?.image),
    });
  } catch {
    useStore.getState().setAiStatus({ aiChatReady: false, aiImageReady: false });
  }
}

interface ChatOptions {
  system?: string;
  prompt: string;
  onDelta?: (fullText: string) => void;
  signal?: AbortSignal;
}

function aiBody(extra: Record<string, unknown>) {
  // 密钥/模型都在服务端按账号取用，这里只传对话内容
  return JSON.stringify(extra);
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
