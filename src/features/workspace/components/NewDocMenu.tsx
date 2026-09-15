"use client";

import { ChevronDown, FilePlus2, FileText, Loader2 } from "lucide-react";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import { listTemplates } from "@/lib/templates";
import { toolBtnBase } from "../constants";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * 侧栏的「新建文章」按钮。
 * 文库里有模板（＝「模板」分类下的文章）时，右侧补一个窄箭头拼成 split button：
 * 主按钮照旧建空白文章，箭头展开模板列表。没有模板就只剩主按钮，界面维持原样，
 * 不给没用过模板的人平白多一个控件。
 */
export function NewDocMenu({ ws }: { ws: Workspace }) {
  const { docActions, library } = ws;
  const templates = listTemplates(library.docs);

  const newBtn = (
    <button
      className={`${toolBtnBase} w-6 hover:text-[var(--accent-deep)] ${
        templates.length > 0 ? "rounded-l-md" : "rounded-md"
      }`}
      title="新建文章"
      onClick={() => void docActions.createDoc()}
      disabled={docActions.creating}
    >
      {docActions.creating ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <FilePlus2 size={13} />
      )}
    </button>
  );

  if (templates.length === 0) return newBtn;

  return (
    <span className="flex items-center">
      {newBtn}
      <Dropdown
        width={200}
        trigger={
          <button
            // 左侧一道发丝线是 split button 的惯例，没有它两个图标看着像互不相干的两枚按钮
            className={`${toolBtnBase} w-3.5 rounded-r-md border-l border-[var(--hairline)] hover:text-[var(--accent-deep)]`}
            title="从模板新建"
            aria-label="从模板新建"
          >
            <ChevronDown size={11} />
          </button>
        }
      >
        <button className={`${menuItemCls} text-left`} onClick={() => void docActions.createDoc()}>
          <FilePlus2 size={13} className="shrink-0 text-[var(--ink-faint)]" />
          空白文章
        </button>
        <div className="my-1 border-t border-[var(--hairline)]" />
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            className={`${menuItemCls} text-left`}
            onClick={() => void docActions.createFromTemplate(tpl)}
          >
            <FileText size={13} className="shrink-0 text-[var(--ink-faint)]" />
            <span className="truncate">{tpl.title || "未命名文章"}</span>
          </button>
        ))}
      </Dropdown>
    </span>
  );
}
