import { useStore, type ChatModelOption, type ChatChoice } from "@/store/useStore";
import { CHAT_PROVIDERS } from "@/lib/ai/catalog";

/** 文本 AI 是否可用（当前账号已启用平台并配置了密钥） */
export function aiReady(): boolean {
  return useStore.getState().aiChatReady;
}

interface ChatScopeData {
  active?: string;
  providers?: Record<string, { hasKey?: boolean; model?: string }>;
}

/** 由服务端返回的文本配置，展开成「已配密钥的平台 → 可选模型」的扁平列表 */
function buildChatModels(chat: ChatScopeData | undefined): ChatModelOption[] {
  const opts: ChatModelOption[] = [];
  for (const meta of CHAT_PROVIDERS) {
    const p = chat?.providers?.[meta.id];
    if (!p?.hasKey) continue;
    const seen = new Set<string>();
    const push = (model: string, label: string) => {
      const m = model.trim();
      if (!m || seen.has(m)) return;
      seen.add(m);
      opts.push({ provider: meta.id, providerLabel: meta.tab, model: m, label });
    };
    for (const m of meta.models) push(m.id, m.label);
    // 用户在设置里填过的自定义模型也补进来
    if (p.model) push(p.model, p.model);
  }
  return opts;
}

/** 文本对话默认平台：优先设置里的显式默认，否则第一个填了密钥的平台；都没有则空 */
function defaultChatProvider(chat: ChatScopeData | undefined): string {
  const active = chat?.active;
  if (active && CHAT_PROVIDERS.some((p) => p.id === active)) return active;
  for (const meta of CHAT_PROVIDERS) {
    if (chat?.providers?.[meta.id]?.hasKey) return meta.id;
  }
  return "";
}

/** 默认平台当前会用到的模型展示名，用于切换器里「默认（xxx）」 */
function defaultChatLabel(chat: ChatScopeData | undefined): string {
  const id = defaultChatProvider(chat);
  const meta = CHAT_PROVIDERS.find((p) => p.id === id);
  if (!meta) return "";
  const model = chat?.providers?.[id]?.model || meta.defaultModel;
  const known = meta.models.find((m) => m.id === model);
  return known?.label ?? model;
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
  const store = useStore.getState();
  const reset = { aiChatReady: false, aiImageReady: false, aiChatModels: [], aiChatDefaultLabel: "" };
  try {
    const res = await fetch("/api/ai/providers");
    if (!res.ok) {
      store.setAiStatus(reset);
      return;
    }
    const data = await res.json();
    // 文本对话：任一平台填了密钥即可用（用哪个在编辑器里切）。
    // 生图：仍需在设置里显式启用某平台。
    const chatModels = buildChatModels(data?.chat);
    const imageReady = Boolean(
      data?.image?.active && data.image.providers?.[data.image.active]?.hasKey
    );
    store.setAiStatus({
      aiChatReady: chatModels.length > 0,
      aiImageReady: imageReady,
      aiChatModels: chatModels,
      aiChatDefaultLabel: defaultChatLabel(data?.chat),
    });
    // 本地记住的临时选择若已失效（对应平台的密钥被删/改），清回「跟随默认」
    const choice = store.aiChatChoice;
    if (choice && !chatModels.some((o) => o.provider === choice.provider && o.model === choice.model)) {
      store.setAiChatChoice(null);
    }
  } catch {
    store.setAiStatus(reset);
  }
}

/** 当前生效的临时选择（已校验仍可用）；无则返回 null 表示走服务端默认 */
export function currentChatChoice(): ChatChoice {
  const { aiChatChoice, aiChatModels } = useStore.getState();
  if (!aiChatChoice) return null;
  const ok = aiChatModels.some(
    (o) => o.provider === aiChatChoice.provider && o.model === aiChatChoice.model
  );
  return ok ? aiChatChoice : null;
}

interface ChatOptions {
  system?: string;
  prompt: string;
  onDelta?: (fullText: string) => void;
  signal?: AbortSignal;
}

function aiBody(extra: Record<string, unknown>) {
  // 密钥在服务端按账号取用；这里带上编辑器里临时选定的平台/模型（若有）
  const choice = currentChatChoice();
  return JSON.stringify(choice ? { ...extra, provider: choice.provider, model: choice.model } : extra);
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
