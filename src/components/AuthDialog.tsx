"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, Mail, Lock } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { GithubMark } from "./GithubMark";
import { LogoMark } from "./LogoMark";

interface AuthConfig {
  github: boolean;
  google: boolean;
}

type Mode = "login" | "register";
type Busy = null | "form" | "github" | "google";

let opener: ((mode: Mode) => void) | null = null;

/** 从任意位置唤起登录/注册弹窗（全局 host 模式，与 askInput 一致） */
export function openAuth(mode: Mode = "login") {
  opener?.(mode);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Google 四色徽标 */
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

export function AuthHost() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    opener = (m) => {
      setMode(m);
      setError("");
      setPassword("");
      setOpen(true);
    };
    return () => {
      opener = null;
    };
  }, []);

  // 首次打开时拉一次能力配置，决定展示哪些第三方登录按钮
  useEffect(() => {
    if (open && !config) {
      void fetch("/api/config")
        .then((r) => r.json())
        .then((c) => setConfig({ github: Boolean(c.github), google: Boolean(c.google) }))
        .catch(() => setConfig({ github: false, google: false }));
    }
  }, [open, config]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => emailRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open, mode]);

  const close = () => {
    if (busy) return; // 提交中不打断
    setOpen(false);
    setPassword("");
    setError("");
  };
  useEscape(close, open);

  if (!open) return null;

  const submit = async () => {
    setError("");
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setError("请输入正确的邮箱地址");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
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
          setError(d.error ?? "注册失败，请重试");
          setBusy(null);
          return;
        }
      }
      const r = await signIn("credentials", { email: em, password, redirect: false });
      if (r?.error) {
        setError(mode === "register" ? "注册成功，但自动登录失败，请重新登录" : "邮箱或密码错误");
        setBusy(null);
        return;
      }
      // 会话已写入，整页刷新以进入登录态并触发云端同步
      window.location.reload();
    } catch {
      setError("网络错误，请稍后重试");
      setBusy(null);
    }
  };

  const oauth = (provider: "github" | "google") => {
    setError("");
    setBusy(provider);
    void signIn(provider); // 整页跳转到第三方授权
  };

  const isLogin = mode === "login";
  const showOAuth = config?.github || config?.google;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]"
      onClick={close}
    >
      <div
        className="toast-in w-[400px] max-w-[94vw] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_24px_70px_-16px_rgba(40,25,5,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="px-6 pb-1 pt-6 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--seal)] text-white shadow-[0_3px_10px_rgba(192,57,43,0.35)]">
            <LogoMark className="h-[60%] w-[60%]" />
          </span>
          <h3 className="mt-3 text-[17px] font-semibold [font-family:var(--serif)]">
            {isLogin ? "登录 xEdit" : "注册 xEdit"}
          </h3>
          <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
            登录后文章自动同步云端，多设备随处可写
          </p>
        </div>

        {/* 邮箱 + 密码表单 */}
        <div className="px-6 pt-4">
          <label className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 transition-colors focus-within:border-[var(--accent)]">
            <Mail size={15} className="shrink-0 text-[var(--ink-faint)]" />
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              className="h-10 w-full bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 transition-colors focus-within:border-[var(--accent)]">
            <Lock size={15} className="shrink-0 text-[var(--ink-faint)]" />
            <input
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="h-10 w-full bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
              placeholder={isLogin ? "密码" : "设置密码（至少 8 位）"}
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
            {busy === "form" ? <Loader2 size={15} className="animate-spin" /> : null}
            {isLogin ? "登录" : "注册并登录"}
          </button>

          <p className="mt-3 text-center text-[12.5px] text-[var(--ink-soft)]">
            {isLogin ? "还没有账号？" : "已有账号？"}
            <button
              className="ml-1 cursor-pointer font-medium text-[var(--seal)] hover:underline disabled:opacity-60"
              onClick={() => {
                setMode(isLogin ? "register" : "login");
                setError("");
              }}
              disabled={busy !== null}
            >
              {isLogin ? "注册新账号" : "去登录"}
            </button>
          </p>
        </div>

        {/* 第三方登录 */}
        {showOAuth ? (
          <div className="px-6 pt-4">
            <div className="flex items-center gap-3 text-[11px] text-[var(--ink-faint)]">
              <span className="h-px flex-1 bg-[var(--hairline)]" />
              或使用第三方账号
              <span className="h-px flex-1 bg-[var(--hairline)]" />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {config?.github ? (
                <button
                  className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] text-[13.5px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)] disabled:opacity-60"
                  onClick={() => oauth("github")}
                  disabled={busy !== null}
                >
                  {busy === "github" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <GithubMark size={15} />
                  )}
                  使用 GitHub 登录
                </button>
              ) : null}
              {config?.google ? (
                <button
                  className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] text-[13.5px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)] disabled:opacity-60"
                  onClick={() => oauth("google")}
                  disabled={busy !== null}
                >
                  {busy === "google" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <GoogleMark size={15} />
                  )}
                  使用 Google 登录
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-5 border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-6 py-3 text-center">
          <button
            className="cursor-pointer text-[12.5px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] disabled:opacity-60"
            onClick={close}
            disabled={busy !== null}
          >
            暂不登录，继续本地写作
          </button>
        </div>
      </div>
    </div>
  );
}
