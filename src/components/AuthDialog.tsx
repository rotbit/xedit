"use client";

/**
 * Sign-in/sign-up dialog. A single global AuthHost is mounted; call openAuth() from anywhere to open it (same host mechanism as askInput).
 * Email/password goes through /api/register + next-auth credentials; third-party providers use a full-page signIn(provider) redirect.
 * After signing in we reload the whole page rather than just updating React state: local documents only start cloud sync with the refreshed session.
 */
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, Mail, Lock } from "lucide-react";
import { createDialogHost } from "@/hooks/useDialogHost";
import { useAppConfig } from "@/features/workspace/hooks/useAppConfig";
import { GithubMark } from "./GithubMark";
import { LogoMark } from "./LogoMark";
import { PaperDialog } from "./Modal";
import { useT } from "@/i18n/useT";

type Mode = "login" | "register";
type OAuthProvider = "github" | "google" | "wechat";
type Busy = null | "form" | OAuthProvider;

const authHost = createDialogHost<Mode, void>(undefined);

/** Open the sign-in/sign-up dialog from anywhere (global host pattern, same as askInput) */
export function openAuth(mode: Mode = "login") {
  void authHost.open(mode);
}

// Only reject input that's obviously not an email. Real validation is up to the register API; an overly strict regex would reject valid addresses
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!config?.github && !config?.google && !config?.wechat) return null;

  return (
    <div className="px-6 pt-4">
      <div className="flex items-center gap-3 text-[11px] text-[var(--ink-faint)]">
        <span className="h-px flex-1 bg-[var(--hairline)]" />
        {t("或使用第三方账号")}
        <span className="h-px flex-1 bg-[var(--hairline)]" />
      </div>
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
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const t = useT();
  // Reset to the caller's mode on every open (email is kept so reopening doesn't require retyping)
  const { state, close } = authHost.useHost((m) => {
    setMode(m);
    setError("");
    setPassword("");
  });
  const open = state !== null;

  useEffect(() => {
    if (open) {
      // Wait a moment before focusing: the panel is still in its toast-in entrance animation, and focusing now would make the focus ring move with it.
      // mode is in the deps so focus returns to the email field after switching between sign-in and sign-up
      const timer = setTimeout(() => emailRef.current?.focus(), 20);
      return () => clearTimeout(timer);
    }
  }, [open, mode]);

  const dismiss = () => {
    if (busy) return; // Don't interrupt while submitting
    setPassword("");
    setError("");
    close();
  };

  // The early return must come after all hooks: the number of hook calls can't vary with the open state
  if (!open) return null;

  const submit = async () => {
    setError("");
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setError(t("请输入正确的邮箱地址"));
      return;
    }
    // 8 characters is the register API's minimum; checking it here saves a request that's bound to fail
    if (password.length < 8) {
      setError(t("密码至少 8 位"));
      return;
    }
    setBusy("form");
    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: em, password }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          setError(d.error ? t(d.error) : t("注册失败，请重试"));
          setBusy(null);
          return;
        }
      }
      // redirect: false makes next-auth return failures here; otherwise it navigates to its built-in error page and everything typed in the dialog is lost
      const r = await signIn("credentials", { email: em, password, redirect: false });
      if (r?.error) {
        setError(mode === "register" ? t("注册成功，但自动登录失败，请重新登录") : t("邮箱或密码错误"));
        setBusy(null);
        return;
      }
      // Session is written; reload the page to enter the signed-in state and trigger cloud sync
      window.location.reload();
    } catch {
      setError(t("网络错误，请稍后重试"));
      setBusy(null);
    }
  };

  const oauth = (provider: OAuthProvider) => {
    setError("");
    setBusy(provider);
    void signIn(provider); // Full-page redirect to third-party authorization
  };

  const isLogin = mode === "login";

  return (
    // z of 120 sits above PaperDialog's default 110: clicking 「去登录」 (Sign in) from another dialog must stack the sign-in dialog on top
    <PaperDialog width={400} maxWidth="94vw" z={120} padded onClose={dismiss}>
      {/* Title */}
      <div className="px-6 pb-1 pt-6 text-center">
        <LogoMark className="mx-auto block h-12 w-auto text-[var(--ink)]" />
        <h3 className="mt-3 text-[17px] font-semibold [font-family:var(--serif)]">
          {isLogin ? t("登录 xEdit") : t("注册 xEdit")}
        </h3>
        <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
          {t("登录后文章自动同步云端，多设备随处可写")}
        </p>
      </div>

      {/* Email + password form */}
      <div className="px-6 pt-4">
        <label className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 transition-colors focus-within:border-[var(--accent)]">
          <Mail size={16} className="shrink-0 text-[var(--ink-faint)]" />
          <input
            ref={emailRef}
            type="email"
            autoComplete="email"
            className="h-10 w-full bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder={t("邮箱地址")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 transition-colors focus-within:border-[var(--accent)]">
          <Lock size={16} className="shrink-0 text-[var(--ink-faint)]" />
          <input
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="h-10 w-full bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder={isLogin ? t("密码") : t("设置密码（至少 8 位）")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
        </label>

        {error ? (
          <p className="mt-2.5 text-[12px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <button
          className="mt-3.5 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--seal)] text-[14px] font-medium text-white shadow-[0_2px_8px_rgba(192,57,43,0.3)] transition-colors hover:bg-[var(--seal-deep)] disabled:opacity-60"
          onClick={() => void submit()}
          disabled={busy !== null}
        >
          {busy === "form" ? <Loader2 size={16} className="animate-spin" /> : null}
          {isLogin ? t("登录") : t("注册并登录")}
        </button>

        <p className="mt-3 text-center text-[12.5px] text-[var(--ink-soft)]">
          {isLogin ? t("还没有账号？") : t("已有账号？")}
          <button
            className="ml-1 cursor-pointer font-medium text-[var(--seal)] hover:underline disabled:opacity-60"
            onClick={() => {
              setMode(isLogin ? "register" : "login");
              setError("");
            }}
            disabled={busy !== null}
          >
            {isLogin ? t("注册新账号") : t("去登录")}
          </button>
        </p>
      </div>

      {/* Third-party sign-in */}
      <OAuthSection busy={busy} onPick={oauth} />

      <div className="mt-5 border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-6 py-3 text-center">
        <button
          className="cursor-pointer text-[12.5px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] disabled:opacity-60"
          onClick={dismiss}
          disabled={busy !== null}
        >
          {t("暂不登录，继续本地写作")}
        </button>
      </div>
    </PaperDialog>
  );
}
