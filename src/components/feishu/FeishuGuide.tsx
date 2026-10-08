"use client";

// 飞书对话框内的「使用说明」折叠面板：从 FeishuDialog 搬出，配置前后都可查看操作指引

/**
 * 「使用说明」折叠面板，内容是纯文案。
 * 但里面列的 4+3 个权限点、重定向 URL 形态和同步规则必须和服务端实际申请的 scope 一致，
 * 改动飞书侧权限或回调路径时，这份说明要一起改，否则用户照着配会连不上。
 */
import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { toast } from "../Toast";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { rich } from "@/i18n/rich";

// 权限名一律等宽字体，左右各留一点空隙，免得和中文正文糊在一起认不出边界
const codeCls = "mx-0.5 [font-family:var(--mono)]";

/** 同步规则逐条列出；「飞书知识库」是同步时真实写进去的分类名（lib/feishu/sync.ts 的 ROOT_CAT），英文里也保留原样 */
const SYNC_RULES = [
  tk("知识库目录层级映射为文章分类：飞书知识库/空间名/…"),
  tk("文档里的图片自动转存到你的图片库，不再依赖飞书"),
  tk("重复同步是安全的：没改动的整篇跳过，有改动的更新并保留版本历史"),
  tk("导入的文章移入回收站后不再被同步更新；彻底删除后再次同步会重新导入"),
  tk("文章列表右键「推送到飞书」：已关联的写回原文档（先做冲突检查），未关联的在上面选择的知识库根目录新建文档"),
  tk("仅支持新版云文档；电子表格、多维表格、思维笔记等会以占位提示代替"),
  tk("凭证与授权只属于你的账号：App Secret 与 token 均加密保存在服务端"),
  tk("按飞书安全策略，授权满 365 天需重新连接一次"),
];

/** 使用说明：折叠收纳在对话框底部，配置前后都可查看 */
export function Guide({ callbackUrl, defaultOpen }: { callbackUrl: string; defaultOpen: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      // 只把按钮上的对勾复原，不额外弹 toast：用户此刻正盯着这个按钮，图标变化就是反馈
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast(t("复制失败"), "error");
    }
  };

  return (
    <section className="rounded-md border border-[var(--hairline)] bg-[var(--paper)]">
      <button
        className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-[12.5px] font-medium text-[var(--ink)]"
        onClick={() => setOpen((v) => !v)}
      >
        {t("使用说明")}
        <ChevronDown
          size={14}
          className={`text-[var(--ink-faint)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-t border-[var(--hairline)] px-4 py-3 text-[12px] leading-5 text-[var(--ink-soft)]">
          <p className="mb-1 font-medium text-[var(--ink)]">{t("首次配置：创建自己的飞书应用（一次即可）")}</p>
          <ol className="mb-3 list-decimal space-y-1.5 pl-4">
            <li>
              {rich(t("到 {link} 创建「企业自建应用」，在「应用能力」里开启{webapp}；"), {
                link: (
                  <a
                    className="text-[var(--accent)] hover:underline"
                    href="https://open.feishu.cn"
                    target="_blank"
                    rel="noreferrer"
                  >
                    open.feishu.cn
                  </a>
                ),
                webapp: <b>{t("网页应用")}</b>,
              })}
            </li>
            <li>
              {rich(t("「权限管理」里申请 4 个{user}权限：{s1}、{s2}、{s3}、{s4}（都是免审权限，开通即生效）。"), {
                user: <b>{t("用户身份")}</b>,
                s1: <code className={codeCls}>wiki:wiki:readonly</code>,
                s2: <code className={codeCls}>docx:document:readonly</code>,
                s3: <code className={codeCls}>docs:document.media:download</code>,
                s4: <code className={codeCls}>offline_access</code>,
              })}{" "}
              {rich(t("如需把 xedit 文章{push}飞书，再加 3 个：{s1}、{s2}、{s3}（同样免审，首次推送时会引导你重新授权）；"), {
                push: <b>{t("推送/写回")}</b>,
                s1: <code className={codeCls}>wiki:wiki</code>,
                s2: <code className={codeCls}>docx:document</code>,
                s3: <code className={codeCls}>docs:document.media:upload</code>,
              })}
            </li>
            <li>
              {t("「安全设置 → 重定向 URL」里添加：")}
              <span className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-2.5 py-1.5 text-[11.5px] [font-family:var(--mono)]">
                  {callbackUrl}
                </code>
                <button
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--hairline-strong)] text-[var(--ink-soft)] hover:bg-[var(--panel)]"
                  onClick={() => void copyUrl()}
                  title={t("复制")}
                >
                  {copied ? <Check size={14} className="text-[var(--accent)]" /> : <Copy size={14} />}
                </button>
              </span>
            </li>
            <li>{t("创建版本并发布应用（首次配置需要发一次版让应用启用；上面的权限本身开通即生效）；")}</li>
            <li>{t("把「凭证与基础信息」里的 App ID / App Secret 填到上方并保存。")}</li>
          </ol>
          <p className="mb-1 font-medium text-[var(--ink)]">{t("日常操作")}</p>
          <ol className="mb-3 list-decimal space-y-1 pl-4">
            <li>{t("点「连接飞书」，在弹出的飞书官方页面登录并点「授权」，弹窗会自动关闭；")}</li>
            <li>{t("回到本窗口，在下拉框里选择要导入的知识库；")}</li>
            <li>
              {t("点「开始同步」。同步期间可以关掉本窗口（完成后会有提示），但请别关闭或刷新页面；")}{" "}
              {t("中断了也没关系，下次同步会跳过没改动的文档、自动续传。")}{" "}
              {t("之后飞书里有更新，再来点一次即可。")}
            </li>
          </ol>
          <p className="mb-1 font-medium text-[var(--ink)]">{t("同步规则")}</p>
          <ul className="space-y-1 pl-1">
            {SYNC_RULES.map((rule) => (
              <li key={rule}>· {t(rule)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
