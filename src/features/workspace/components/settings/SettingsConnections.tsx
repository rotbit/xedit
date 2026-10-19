"use client";

/**
 * The 「已授权的应用」 (Authorized apps) section of settings: lists clients connected to xEdit via OAuth (MCP), each revocable.
 * Data comes from GET /api/oauth/connections; revoking is a DELETE to the same URL with { clientId };
 * after a successful revoke, just remove that row locally instead of refetching the whole list.
 */
import { useEffect, useState } from "react";
import { askConfirm } from "@/components/PromptDialog";
import { toast } from "@/components/Toast";
import { tk } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import { Section } from "./SettingsParts";

interface Connection {
  clientId: string;
  name: string;
  /** Serialized ISO time string */
  since: string;
}

/** The fallback name the server gives unnamed clients (stored as a Chinese key), translated at display time */
const UNNAMED = tk("未命名应用");

export function SettingsConnections() {
  const t = useT();
  const locale = useLocale();
  const [list, setList] = useState<Connection[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/oauth/connections")
      .then((r) => (r.ok ? (r.json() as Promise<Connection[]>) : Promise.reject(new Error(String(r.status)))))
      .then((rows) => {
        if (alive) setList(rows);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const fmt = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium" });

  const revoke = async (c: Connection) => {
    const name = c.name === UNNAMED ? t(UNNAMED) : c.name;
    const ok = await askConfirm({
      title: t("撤销授权"),
      message: t("撤销后「{name}」将无法再访问你的文档，需要时可重新授权。", { name }),
      confirmText: t("撤销"),
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await fetch("/api/oauth/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: c.clientId }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setList((prev) => prev?.filter((x) => x.clientId !== c.clientId) ?? null);
      toast(t("已撤销"), "success");
    } catch {
      toast(t("撤销失败，请稍后重试"), "error");
    }
  };

  const note = (text: string) => <p className="py-3 text-[13px] text-[var(--ink-faint)]">{text}</p>;

  return (
    <Section title={t("已授权的应用")}>
      {failed
        ? note(t("加载失败，请稍后重试"))
        : list === null
          ? note(t("加载中…"))
          : list.length === 0
            ? note(t("还没有授权过任何应用"))
            : list.map((c) => (
                <div key={c.clientId} className="flex items-center justify-between gap-6 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] text-[var(--ink)]">
                      {c.name === UNNAMED ? t(UNNAMED) : c.name}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[var(--ink-faint)]">
                      {t("授权于 {date}", { date: fmt.format(new Date(c.since)) })}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer text-[13px] text-red-600 hover:underline dark:text-red-400"
                    onClick={() => void revoke(c)}
                  >
                    {t("撤销")}
                  </button>
                </div>
              ))}
    </Section>
  );
}
