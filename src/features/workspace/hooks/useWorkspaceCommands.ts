"use client";

// Global workspace commands (the first batch in the ⌘⇧P palette): new / navigate / sidebar.
// A separate hook so Home doesn't keep piling up tables — it's already the home page's main assembly point.

import { useRegisterCommands } from "@/hooks/useRegisterCommands";
import { useT } from "@/i18n/useT";
import type { Command } from "@/lib/commandRegistry";
import { listTemplates } from "@/lib/templates";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { ALL, TODAY, TRASH } from "../constants";
import type { Workspace } from "./useWorkspace";

interface Params {
  ws: Workspace;
  /** Register nothing without a workspace (landing page): there are no docs to act on there */
  enabled: boolean;
  onQuickSwitch: () => void;
}

export function useWorkspaceCommands({ ws, enabled, onQuickSwitch }: Params) {
  const { nav, prefs, docActions, library } = ws;
  // The command table registers once per deps and then stays put: t changes reference with the locale, so it's in deps to re-register everything after a language switch
  const t = useT();

  // One command per doc in the 「模板」 category: type the template name in ⌘⇧P to create a doc, no need to hunt for the little arrow in the sidebar
  const templates = listTemplates(library.docs);
  const templateCmds: Command[] = templates.map((tpl) => ({
    id: `template.${tpl.id}`,
    group: t("模板"),
    label: t("用「{name}」新建", { name: tpl.title || t(UNTITLED_DOC) }),
    run: () => docActions.createFromTemplate(tpl),
  }));

  const cmds: Command[] = enabled
    ? [
        {
          id: "workspace.new",
          group: t("文章"),
          label: t("新建文章"),
          run: () => docActions.createDoc(),
        },
        {
          id: "workspace.switch",
          group: t("导航"),
          label: t("快速切换文章"),
          keys: "⌘O",
          run: onQuickSwitch,
        },
        {
          id: "workspace.all",
          group: t("导航"),
          label: t("回到最近打开"),
          run: () => nav.openCategory(ALL),
        },
        {
          id: "workspace.today",
          group: t("导航"),
          label: t("打开今天"),
          run: () => nav.openCategory(TODAY),
        },
        {
          id: "workspace.trash",
          group: t("导航"),
          label: t("打开回收站"),
          run: () => nav.openCategory(TRASH),
        },
        {
          id: "view.sidebar",
          group: t("视图"),
          label: t("折叠 / 展开侧栏"),
          run: prefs.toggleSidebar,
        },
        ...templateCmds,
      ]
    : [];

  // The command table only really changes when "has a workspace" flips or templates are added/removed/renamed; other closures
  // (nav is new every render) are kept fresh by useRegisterCommands' ref;
  // otherwise every keystroke would unregister and re-register everything
  const templateKey = templates.map((tpl) => `${tpl.id}:${tpl.title}`).join("\n");
  useRegisterCommands(cmds, [enabled, templateKey, t]);
}
