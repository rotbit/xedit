import { useStore } from "@/store/useStore";
import { CHAT_PROVIDERS } from "@/lib/ai/catalog";

interface ChatScopeData {
  providers?: Record<string, { hasKey?: boolean }>;
}

/**
 * 从服务端拉取当前账号的 AI 配置，刷新「文本 AI 是否可用」标记（内容审查用）。
 * 任一平台填了密钥即视为可用；未登录（401）或出错时视为不可用。
 * 应在应用启动、以及保存 AI 设置后调用。
 */
export async function refreshAiStatus(): Promise<void> {
  const store = useStore.getState();
  try {
    const res = await fetch("/api/ai/providers");
    if (!res.ok) {
      store.setAiStatus({ aiChatReady: false });
      return;
    }
    const data = await res.json();
    const chat: ChatScopeData | undefined = data?.chat;
    const ready = CHAT_PROVIDERS.some((p) => chat?.providers?.[p.id]?.hasKey);
    store.setAiStatus({ aiChatReady: ready });
  } catch {
    store.setAiStatus({ aiChatReady: false });
  }
}
