"use client";

// 工作台全局命令（⌘⇧P 面板里的第一批）：新建 / 导航 / 侧栏。
// 单独成 hook 是为了不再往 Home 里堆表格——它已经是首页的总装配点。

import { useRegisterCommands } from "@/hooks/useRegisterCommands";
import type { Command } from "@/lib/commandRegistry";
import { listTemplates } from "@/lib/templates";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { ALL, TRASH } from "../constants";
import type { Workspace } from "./useWorkspace";

interface Params {
  ws: Workspace;
  /** 没有工作台（落地页）时一条都不注册：那里没有文章可操作 */
  enabled: boolean;
  onQuickSwitch: () => void;
}

export function useWorkspaceCommands({ ws, enabled, onQuickSwitch }: Params) {
  const { nav, prefs, docActions, library } = ws;

  // 「模板」分类里每篇文章一条命令：⌘⇧P 敲模板名就能建稿，不必去侧栏找那个小箭头
  const templates = listTemplates(library.docs);
  const templateCmds: Command[] = templates.map((tpl) => ({
    id: `template.${tpl.id}`,
    group: "模板",
    label: `用「${tpl.title || UNTITLED_DOC}」新建`,
    run: () => docActions.createFromTemplate(tpl),
  }));

  const cmds: Command[] = enabled
    ? [
        {
          id: "workspace.new",
          group: "文章",
          label: "新建文章",
          run: () => docActions.createDoc(),
        },
        {
          id: "workspace.switch",
          group: "导航",
          label: "快速切换文章",
          keys: "⌘O",
          run: onQuickSwitch,
        },
        {
          id: "workspace.all",
          group: "导航",
          label: "回到全部文章",
          run: () => nav.openCategory(ALL),
        },
        {
          id: "workspace.trash",
          group: "导航",
          label: "打开回收站",
          run: () => nav.openCategory(TRASH),
        },
        {
          id: "view.sidebar",
          group: "视图",
          label: "折叠 / 展开侧栏",
          run: prefs.toggleSidebar,
        },
        ...templateCmds,
      ]
    : [];

  // 命令表只在「有没有工作台」翻转、或模板集合增删/改名时真的变，其余闭包
  // （nav 每次渲染都是新的）由 useRegisterCommands 的 ref 兜新鲜度；
  // 否则每次击键都要注销重注册一轮
  const templateKey = templates.map((t) => `${t.id}:${t.title}`).join("\n");
  useRegisterCommands(cmds, [enabled, templateKey]);
}
