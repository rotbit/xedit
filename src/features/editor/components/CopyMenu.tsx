"use client";

import { Copy, ChevronDown, Loader2 } from "lucide-react";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import { useCopyActions } from "../hooks/useCopyActions";

/** 一键复制：选择目标平台，产出对应富文本写入剪贴板 */
export function CopyMenu() {
  const { copying, copyWechat, copyZhihu } = useCopyActions();
  const busy = copying !== null;

  return (
    <Dropdown
      width={172}
      trigger={
        <button
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 text-[13px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)]"
          disabled={busy}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
          <span className="hidden min-[400px]:inline">一键复制</span>
          <ChevronDown size={13} className="opacity-80" />
        </button>
      }
    >
      <button className={menuItemCls} onClick={() => void copyWechat()} disabled={busy}>
        复制到公众号
      </button>
      <button className={menuItemCls} onClick={() => void copyZhihu()} disabled={busy}>
        复制到知乎
      </button>
    </Dropdown>
  );
}
