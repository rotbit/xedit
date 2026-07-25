"use client";

import { Settings2, Sparkles, Plug } from "lucide-react";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import { useStore } from "@/store/useStore";
import { ToggleRow, TypographyTuner } from "./MenuControls";
import { ghostBtn } from "../lib/styles";

/** 编辑页顶栏设置菜单：渲染开关 + 排版微调 + AI / MCP 入口 */
export function SettingsMenu({
  onOpenAiSettings,
  onOpenMcp,
}: {
  onOpenAiSettings: () => void;
  onOpenMcp: () => void;
}) {
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);

  return (
    <Dropdown
      width={264}
      trigger={
        <button className={ghostBtn} title="设置">
          <Settings2 size={15} />
        </button>
      }
    >
      <ToggleRow label="外链转文末引用" value={linkFootnote} onChange={setLinkFootnote} />
      <ToggleRow label="同步滚动" value={syncScroll} onChange={setSyncScroll} />
      <div className="my-1.5 border-t border-[var(--hairline)]" />
      <TypographyTuner />
      <div className="my-1 border-t border-[var(--hairline)]" />
      <button className={menuItemCls} onClick={onOpenAiSettings}>
        <Sparkles size={14} />
        AI 设置…
      </button>
      <button className={menuItemCls} onClick={onOpenMcp}>
        <Plug size={14} />
        MCP 连接…
      </button>
    </Dropdown>
  );
}
