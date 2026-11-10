"use client";

/**
 * Third-party sign-in dialog. A single global AuthHost is mounted; call openAuth() from anywhere to open it (same host mechanism as askInput).
 * Only configured OAuth providers are offered; local writing remains available without signing in.
 * After signing in we reload the whole page rather than just updating React state: local documents only start cloud sync with the refreshed session.
 */
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { createDialogHost } from "@/hooks/useDialogHost";
import { useAppConfig } from "@/features/workspace/hooks/useAppConfig";
import { GithubMark } from "./GithubMark";
import { LogoMark } from "./LogoMark";
import { PaperDialog } from "./Modal";
import { useT } from "@/i18n/useT";

type Mode = "login";
type OAuthProvider = "github" | "google" | "wechat";
type Busy = null | OAuthProvider;

const authHost = createDialogHost<Mode, void>(undefined);

/** Open the sign-in dialog from anywhere (global host pattern, same as askInput) */
export function openAuth(mode: Mode = "login") {
  void authHost.open(mode);
}

/** Google four-color logo */
function GoogleMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** WeChat double-bubble logo in brand green */
function WechatMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {/* Back large bubble: ellipse + bottom-left tail; same color overlapping so they merge into one shape */}
      <g fill="#07C160">
        <ellipse cx="8.6" cy="8.8" rx="7.6" ry="6.8" />
        <path d="M4.6 12.4 2 17.6l5.3-2.4z" />
      </g>
      {/* Front small bubble: first a white outline as a gap, then a solid green fill to cover the inner white line */}
      <g fill="#fff" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round">
        <ellipse cx="17.2" cy="15.4" rx="6.2" ry="5.6" />
        <path d="M19.6 18.6 23.4 21.4 21.8 16.4z" />
      </g>
      <g fill="#07C160">
        <ellipse cx="17.2" cy="15.4" rx="6.2" ry="5.6" />
        <path d="M19.6 18.6 23.4 21.4 21.8 16.4z" />
      </g>
      {/* Eyes */}
      <g fill="#fff">
        <circle cx="6.2" cy="7.2" r="1.15" />
        <circle cx="11" cy="7.2" r="1.15" />
        <circle cx="15.2" cy="13.6" r=".95" />
        <circle cx="19.2" cy="13.6" r=".95" />
      </g>
    </svg>
  );
}

/** Third-party sign-in button: the three providers differ only in logo and label; the clicked one swaps its logo for a spinner */
function OAuthButton({
  provider,
  label,
  icon,
  busy,
  onPick,
}: {
  provider: OAuthProvider;
  label: string;
  icon: React.ReactNode;
  busy: Busy;
  onPick: (provider: OAuthProvider) => void;
}) {
  return (
    <button
      className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] text-[13.5px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)] disabled:opacity-60"
      onClick={() => onPick(provider)}
      disabled={busy !== null}
    >
      {busy === provider ? <Loader2 size={16} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

/**
 * Third-party sign-in section: shows whichever providers the deployment configured; with none configured, not even the divider renders.
 * It's a separate component so /api/config is fetched only once the dialog opens (this component mounts),
 * and the AuthHost that's always mounted on the landing page doesn't fire an extra request.
 */
function OAuthSection({
  busy,
  onPick,
}: {
  busy: Busy;
  onPick: (provider: OAuthProvider) => void;
}) {
  const config = useAppConfig();
  const t = useT();
  if (!config) return <p className="px-6 py-5 text-center text-sm">{t("正在加载登录方式")}</p>;
  if (!config.github && !config.google && !config.wechat) {
    return <p className="px-6 py-5 text-center text-sm">{t("暂未开放账号登录，你仍可在本地写作")}</p>;
  }

  return (
    <div className="px-6 pt-4">
      <div className="mt-3 flex flex-col gap-2">
        {config.github ? (
          <OAuthButton
            provider="github"
            label={t("使用 GitHub 登录")}
            icon={<GithubMark size={15} />}
            busy={busy}
            onPick={onPick}
          />
        ) : null}
        {config.google ? (
          <OAuthButton
            provider="google"
            label={t("使用 Google 登录")}
            icon={<GoogleMark size={15} />}
            busy={busy}
            onPick={onPick}
          />
        ) : null}
        {config.wechat ? (
          <OAuthButton
            provider="wechat"
            label={t("使用微信登录")}
            icon={<WechatMark size={15} />}
            busy={busy}
            onPick={onPick}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Sign-in dialog host. One instance lives in the app shell; renders null when not opened. */
export function AuthHost() {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const t = useT();
  const { state, close } = authHost.useHost(() => {
    setBusy(null);
    setError("");
  });
  if (state === null) return null;

  const oauth = (provider: OAuthProvider) => {
    setError("");
    setBusy(provider);
    void signIn(provider).catch(() => {
      setError(t("网络错误，请稍后重试"));
      setBusy(null);
    });
  };

  return (
    <PaperDialog width={400} maxWidth="94vw" z={120} padded onClose={() => { if (!busy) close(); }}>
      <div className="px-6 pb-1 pt-6 text-center">
        <LogoMark className="mx-auto block h-12 w-auto text-[var(--ink)]" />
        <h3 className="mt-3 text-[17px] font-semibold [font-family:var(--serif)]">{t("登录 xEdit")}</h3>
        <p className="mt-1 text-[12px] text-[var(--ink-faint)]">{t("使用第三方账号登录，文章自动同步云端")}</p>
      </div>
      <OAuthSection busy={busy} onPick={oauth} />
      {error ? <p role="alert" className="px-6 pt-3 text-sm text-red-600">{error}</p> : null}
      <div className="mt-5 border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-6 py-3 text-center">
        <button className="cursor-pointer text-[12.5px] text-[var(--ink-soft)] disabled:opacity-60"
          onClick={() => close()} disabled={busy !== null}>
          {t("暂不登录，继续本地写作")}
        </button>
      </div>
    </PaperDialog>
  );
}
