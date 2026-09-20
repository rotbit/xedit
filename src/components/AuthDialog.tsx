"use client";

/**
 * 登录/注册弹窗。全局只挂一份 AuthHost，任何位置调 openAuth() 唤起（和 askInput 同一套 host 机制）。
 * 邮箱密码走 /api/register + next-auth 的 credentials，第三方走 signIn(provider) 整页跳转。
 * 登录成功后整页 reload 而不是只改 React 状态：本地文稿要靠刷新后的登录态才会走云端同步。
 */
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, Mail, Lock } from "lucide-react";
import { createDialogHost } from "@/hooks/useDialogHost";
import { useAppConfig } from "@/features/workspace/hooks/useAppConfig";
import { GithubMark } from "./GithubMark";
import { LogoMark } from "./LogoMark";
import { PaperDialog } from "./Modal";

type Mode = "login" | "register";
type OAuthProvider = "github" | "google" | "wechat";
type Busy = null | "form" | OAuthProvider;

const authHost = createDialogHost<Mode, void>(undefined);

/** 从任意位置唤起登录/注册弹窗（全局 host 模式，与 askInput 一致） */
export function openAuth(mode: Mode = "login") {
  void authHost.open(mode);
}

// 只挡明显不是邮箱的输入。真正的有效性由注册接口判定，正则写太严会误伤合法地址
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

/** 微信双气泡徽标，用品牌绿 */
function WechatMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {/* 后面的大气泡：椭圆 + 左下尾巴，同色叠在一起自然连成一体 */}
      <g fill="#07C160">
        <ellipse cx="8.6" cy="8.8" rx="7.6" ry="6.8" />
        <path d="M4.6 12.4 2 17.6l5.3-2.4z" />
      </g>
      {/* 前面的小气泡：先描一圈白当间隔，再用纯绿填一遍盖掉内部白线 */}
      <g fill="#fff" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round">
        <ellipse cx="17.2" cy="15.4" rx="6.2" ry="5.6" />
        <path d="M19.6 18.6 23.4 21.4 21.8 16.4z" />
      </g>
      <g fill="#07C160">
        <ellipse cx="17.2" cy="15.4" rx="6.2" ry="5.6" />
        <path d="M19.6 18.6 23.4 21.4 21.8 16.4z" />
      </g>
      {/* 眼睛 */}
      <g fill="#fff">
        <circle cx="6.2" cy="7.2" r="1.15" />
        <circle cx="11" cy="7.2" r="1.15" />
        <circle cx="15.2" cy="13.6" r=".95" />
        <circle cx="19.2" cy="13.6" r=".95" />
      </g>
    </svg>
  );
}

/** 第三方登录按钮：三家只差徽标与文案，点了的那个把徽标换成转圈 */
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
 * 第三方登录区：部署侧配置了哪几家就显示哪几家，一家都没配就连分隔线也不出。
 * 单独成组件是为了让 /api/config 只在弹窗打开（本组件挂载）后才拉一次，
 * 落地页常驻的 AuthHost 不会为此多发一个请求。
 */
function OAuthSection({
  busy,
  onPick,
}: {
  busy: Busy;
  onPick: (provider: OAuthProvider) => void;
}) {
  const config = useAppConfig();
  if (!config?.github && !config?.google && !config?.wechat) return null;

  return (
    <div className="px-6 pt-4">
      <div className="flex items-center gap-3 text-[11px] text-[var(--ink-faint)]">
        <span className="h-px flex-1 bg-[var(--hairline)]" />
        或使用第三方账号
        <span className="h-px flex-1 bg-[var(--hairline)]" />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {config.github ? (
          <OAuthButton
            provider="github"
            label="使用 GitHub 登录"
            icon={<GithubMark size={15} />}
            busy={busy}
            onPick={onPick}
          />
        ) : null}
        {config.google ? (
          <OAuthButton
            provider="google"
            label="使用 Google 登录"
            icon={<GoogleMark size={15} />}
            busy={busy}
            onPick={onPick}
          />
        ) : null}
        {config.wechat ? (
          <OAuthButton
            provider="wechat"
            label="使用微信登录"
            icon={<WechatMark size={15} />}
            busy={busy}
            onPick={onPick}
          />
        ) : null}
      </div>
    </div>
  );
}

/** 登录弹窗宿主。挂在应用外壳里常驻一份，没被唤起时渲染 null。 */
export function AuthHost() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  // 每次唤起按调用方给的模式重置（邮箱保留，重开不用再输一遍）
  const { state, close } = authHost.useHost((m) => {
    setMode(m);
    setError("");
    setPassword("");
  });
  const open = state !== null;

  useEffect(() => {
    if (open) {
      // 等一小会儿再聚焦：面板此刻还在 toast-in 入场动画里，立刻 focus 会让焦点框跟着动画一起位移。
      // 依赖带上 mode，是为了在登录/注册之间切换后把焦点收回邮箱框
      const t = setTimeout(() => emailRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open, mode]);

  const dismiss = () => {
    if (busy) return; // 提交中不打断
    setPassword("");
    setError("");
    close();
  };

  // 早退必须排在所有 hook 之后：hook 的调用数量不能随开关变化
  if (!open) return null;

  const submit = async () => {
    setError("");
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setError("请输入正确的邮箱地址");
      return;
    }
    // 8 位是注册接口的下限，前端先挡一道，省掉一次注定失败的请求
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
      // redirect: false 让 next-auth 把失败结果回传给这里，否则它会整页跳到自带的错误页，弹窗里填的内容全丢
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

  const oauth = (provider: OAuthProvider) => {
    setError("");
    setBusy(provider);
    void signIn(provider); // 整页跳转到第三方授权
  };

  const isLogin = mode === "login";

  return (
    // z 给到 120，高于 PaperDialog 默认的 110：从别的弹窗里点「去登录」时，登录框要压在原弹窗上面
    <PaperDialog width={400} maxWidth="94vw" z={120} padded onClose={dismiss}>
      {/* 标题 */}
      <div className="px-6 pb-1 pt-6 text-center">
        <LogoMark className="mx-auto block h-12 w-auto text-[var(--ink)]" />
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
          <Mail size={16} className="shrink-0 text-[var(--ink-faint)]" />
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
          <Lock size={16} className="shrink-0 text-[var(--ink-faint)]" />
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
          {busy === "form" ? <Loader2 size={16} className="animate-spin" /> : null}
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
      <OAuthSection busy={busy} onPick={oauth} />

      <div className="mt-5 border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-6 py-3 text-center">
        <button
          className="cursor-pointer text-[12.5px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] disabled:opacity-60"
          onClick={dismiss}
          disabled={busy !== null}
        >
          暂不登录，继续本地写作
        </button>
      </div>
    </PaperDialog>
  );
}
