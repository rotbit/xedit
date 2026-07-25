"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { X, Loader2, Copy, Check, Trash2, Plug } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { toast } from "./Toast";
import { openAuth } from "./AuthDialog";

interface Connection {
  clientId: string;
  name: string;
  since: string;
}

/** MCP 服务器地址随站点部署固定，订阅无需做任何事 */
const subscribeNoop = () => () => {};
const getMcpUrl = () => `${window.location.origin}/api/mcp`;

/**
 * MCP 连接设置：展示 MCP 服务器地址与接入方法，管理（撤销）已授权的 AI 客户端。
 * 接入走标准 OAuth 2.1（客户端里点「连接」即弹授权页），无需手动生成令牌。
 */
export function McpDialog({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [conns, setConns] = useState<Connection[]>([]);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  // origin 只有浏览器里才有；用 useSyncExternalStore 读，服务端快照给空串，避免水合不一致
  const mcpUrl = useSyncExternalStore(subscribeNoop, getMcpUrl, () => "");
  useEscape(onClose, true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/oauth/connections");
        if (res.status === 401) {
          if (!cancelled) setNeedLogin(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setConns(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) toast("加载已授权应用失败", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("复制失败", "error");
    }
  };

  const revoke = async (clientId: string, name: string) => {
    setRevoking(clientId);
    try {
      const res = await fetch("/api/oauth/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error();
      setConns((c) => c.filter((x) => x.clientId !== clientId));
      toast(`已撤销「${name}」的授权`, "success");
    } catch {
      toast("撤销失败", "error");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-[520px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span className="flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]">
            <Plug size={15} className="text-[var(--accent)]" />
            MCP 连接
          </span>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex h-56 items-center justify-center text-[var(--ink-faint)]">
            <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
          </div>
        ) : needLogin ? (
          <div className="flex flex-col items-center gap-4 px-8 py-14 text-center">
            <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
              MCP 让 Claude、Cursor 等 AI 客户端
              <br />
              以你的身份读写 xedit 文档，请先登录。
            </p>
            <button
              className="cursor-pointer rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)]"
              onClick={() => {
                onClose();
                openAuth("login");
              }}
            >
              去登录
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
            {/* 服务器地址 */}
            <section>
              <p className="mb-1.5 text-[12px] text-[var(--ink-soft)]">MCP 服务器地址</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 py-2 text-[12.5px] text-[var(--ink)] [font-family:var(--mono)]">
                  {mcpUrl}
                </code>
                <button
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--hairline-strong)] text-[var(--ink-soft)] hover:bg-[var(--paper)]"
                  onClick={copyUrl}
                  title="复制"
                >
                  {copied ? <Check size={15} className="text-[var(--accent)]" /> : <Copy size={15} />}
                </button>
              </div>
            </section>

            {/* 接入方法 */}
            <section className="rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3">
              <p className="mb-1.5 text-[12.5px] font-medium text-[var(--ink)]">接入方法</p>
              <ul className="space-y-1.5 text-[12px] leading-5 text-[var(--ink-soft)]">
                <li>
                  · <b>Cursor</b>：设置 → MCP → 添加，type 选 <code className="[font-family:var(--mono)]">http</code>，url 填上面的地址。
                </li>
                <li>
                  · <b>Claude Desktop</b>：Settings → Connectors → 添加自定义连接器，填上面的地址。
                </li>
                <li>· 连接时会自动打开授权页，登录并点「允许」即可，无需手动生成密钥。</li>
              </ul>
            </section>

            {/* 已授权应用 */}
            <section>
              <p className="mb-2 text-[12px] text-[var(--ink-soft)]">已授权的应用</p>
              {conns.length === 0 ? (
                <p className="rounded-md border border-dashed border-[var(--hairline-strong)] px-3 py-6 text-center text-[12px] text-[var(--ink-faint)]">
                  还没有已授权的客户端
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {conns.map((c) => (
                    <li
                      key={c.clientId}
                      className="flex items-center gap-3 rounded-md border border-[var(--hairline-strong)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-[var(--ink)]">{c.name}</p>
                        <p className="text-[11px] text-[var(--ink-faint)]">
                          授权于 {new Date(c.since).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                      <button
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-red-600 disabled:opacity-50"
                        onClick={() => revoke(c.clientId, c.name)}
                        disabled={revoking === c.clientId}
                      >
                        {revoking === c.clientId ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        撤销
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] leading-4 text-[var(--ink-faint)]">
                撤销后该应用需重新授权；已签发的访问令牌最长 1 小时内失效。
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
