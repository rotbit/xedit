"use client";

/**
 * 「设置」页：工作区里的虚拟视图（同今天 / 历史已完成），从侧栏头像菜单进入。
 * 把散落各处的用户设置集中到一页：账号、通用（语言 / 外观）、阅读与编辑、AI 内容审查、
 * 已授权的应用、文件列表。每项都直接改原来那份状态（zustand store / ws.prefs / cookie /
 * localStorage），本页不另存一份，别处改了这里照样一致。
 */
import { useState } from "react";
import { isDark, setDark } from "@/components/DarkToggle";
import { btnSecondary } from "@/components/Modal";
import { TypographyTuner } from "@/components/ThemePicker";
import { ReviewSettingsFields } from "@/features/review/ReviewSettings";
import { setLocale, type Locale } from "@/i18n/locale";
import { useLocale, useT } from "@/i18n/useT";
import { useStore } from "@/store/useStore";
import { signOutAndClear } from "../../lib/signOutAndClear";
import { SettingsConnections } from "./SettingsConnections";
import { LinkBtn, Row, Section, Seg, Switch } from "./SettingsParts";
import type { DocView } from "../../hooks/useSidebarPrefs";
import type { Workspace } from "../../hooks/useWorkspace";

/** 账号：邮箱、管理后台入口、退出登录 */
function AccountSection({ ws }: { ws: Workspace }) {
  const t = useT();
  const user = ws.auth.session?.user;
  return (
    <Section title={t("账号")}>
      <Row label={t("邮箱")}>
        <span className="text-[13px] text-[var(--ink-soft)]">{user?.email ?? user?.name ?? ""}</span>
      </Row>
      {user?.isAdmin ? (
        <Row label={t("管理后台")}>
          <a className={btnSecondary} href="/admin">
            {t("打开")}
          </a>
        </Row>
      ) : null}
      <div className="py-3">
        <button
          type="button"
          className="cursor-pointer text-[13.5px] text-red-600 hover:underline dark:text-red-400"
          onClick={() => signOutAndClear(t)}
        >
          {t("退出登录")}
        </button>
      </div>
    </Section>
  );
}

/** 通用：界面语言、日间 / 夜间 */
function GeneralSection() {
  const t = useT();
  const locale = useLocale();
  // data-theme 不进 React 状态，这里自己记一份，点了就跟着改
  const [dark, setDarkState] = useState(isDark);
  return (
    <Section title={t("通用")}>
      <Row label={t("语言")}>
        <Seg<Locale>
          value={locale}
          options={[
            // i18n-ignore 语言名不翻译：看不懂当前语言的人也认得出自己的语言
            { value: "zh", label: "中文" },
            { value: "en", label: "English" },
          ]}
          onChange={setLocale}
        />
      </Row>
      <Row label={t("外观")}>
        <Seg<"light" | "dark">
          value={dark ? "dark" : "light"}
          options={[
            { value: "light", label: t("日间") },
            { value: "dark", label: t("夜间") },
          ]}
          onChange={(v) => {
            setDark(v === "dark");
            setDarkState(v === "dark");
          }}
        />
      </Row>
    </Section>
  );
}

/** 阅读与编辑：导出、双屏、排版微调、自定义 CSS 与主题入口 */
function EditingSection() {
  const t = useT();
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);
  const setCssDialogOpen = useStore((s) => s.setCssDialogOpen);
  const setThemeStudio = useStore((s) => s.setThemeStudio);
  return (
    <Section title={t("阅读与编辑")}>
      <Row label={t("外链转文末引用")} hint={t("导出时把正文里的链接改成文末引用")}>
        <Switch checked={linkFootnote} label={t("外链转文末引用")} onChange={setLinkFootnote} />
      </Row>
      <Row label={t("同步滚动")} hint={t("双屏时编辑区和预览一起滚")}>
        <Switch checked={syncScroll} label={t("同步滚动")} onChange={setSyncScroll} />
      </Row>
      {/* 滑杆组件自带 px-3.5 行内边距（原本挂在下拉面板里），这里抵消掉对齐左边线 */}
      <TypographyTuner className="-mx-3.5 py-2" />
      <Row label={t("自定义 CSS")} hint={t("在所选主题之上追加自己的样式")}>
        <LinkBtn onClick={() => setCssDialogOpen(true)}>{t("编辑")}</LinkBtn>
      </Row>
      <Row label={t("排版主题")} hint={t("从现有主题出发调一套自己的")}>
        <LinkBtn onClick={() => setThemeStudio("new")}>{t("新建主题")}</LinkBtn>
      </Row>
    </Section>
  );
}

/** 文件列表：默认视图、侧栏宽度 */
function FilesSection({ ws }: { ws: Workspace }) {
  const t = useT();
  const { prefs } = ws;
  return (
    <Section title={t("文件列表")}>
      <Row label={t("默认视图")}>
        <Seg<DocView>
          value={prefs.docView}
          options={[
            { value: "card", label: t("时间流") },
            { value: "list", label: t("列表") },
          ]}
          onChange={prefs.switchDocView}
        />
      </Row>
      <Row label={t("侧栏宽度")} hint={t("拖动侧栏右缘可调宽")}>
        <LinkBtn onClick={prefs.resetSidebarWidth}>{t("恢复默认")}</LinkBtn>
      </Row>
    </Section>
  );
}

export function SettingsView({ ws }: { ws: Workspace }) {
  const t = useT();
  // 账号与授权应用都要登录：本地模式下不摆这两段
  const loggedIn = ws.auth.loggedIn;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[640px] px-6 pb-16 pt-9 sm:px-10">
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight">{t("设置")}</h1>
        <div className="mt-8 space-y-10">
          {loggedIn ? <AccountSection ws={ws} /> : null}
          <GeneralSection />
          <EditingSection />
          <Section title={t("AI 内容审查")}>
            <div className="max-w-[420px] pt-3">
              <ReviewSettingsFields />
            </div>
          </Section>
          {loggedIn ? <SettingsConnections /> : null}
          <FilesSection ws={ws} />
        </div>
      </div>
    </div>
  );
}
