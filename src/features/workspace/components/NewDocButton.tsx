"use client";

/**
 * 内容区顶栏右端的「新建文章」分体按钮：左段直接新建，右段 chevron 展开导入菜单。
 * 做成一颗按钮的两半而不是两颗：新建是高频主操作，导入一年用不了几次，
 * 让它蹭主按钮的位置但不占视觉权重。
 * 这里的导入不指定分类，落点沿用 useImportDocs 的「当前分类」算法；
 * 要往某个具体文件夹里导入，走文件树的右键菜单。
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookDown, ChevronDown, FileInput, FilePlus2, FolderInput, Loader2 } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { menuItemCls, menuPanelCls } from "../constants";
import type { ImportMode } from "../hooks/useImportDocs";
import type { Workspace } from "../hooks/useWorkspace";

/** 下拉宽度：与分类菜单的 w-44 同宽 */
const MENU_WIDTH = 176;

/** 右锚定位：菜单贴按钮右缘展开，顶栏靠右时不会伸出屏幕 */
interface Anchor {
  top: number;
  right: number;
}

export function NewDocButton({ ws }: { ws: Workspace }) {
  const { auth, docActions, dialogs } = ws;
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const close = () => setAnchor(null);
  useEscape(close, anchor !== null);
  useDismissMenu(panelRef, close, anchor !== null);

  /** 再点一次 chevron 收起：按钮带 data-menu-trigger，外部关闭逻辑会放它一马 */
  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor((prev) => (prev ? null : { top: r.bottom + 4, right: window.innerWidth - r.right }));
  };

  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const openImport = (mode: ImportMode) => run(() => dialogs.openImport(mode));

  return (
    <>
      {/* 新建中整颗一起变淡：只淡左半会看着像按钮裂了。
          外壳自己垫一层 accent：中间那条半透明分隔线要叠在 accent 上才是「同一颗按钮」，否则透出的是纸色 */}
      <div
        className={`ml-2 flex h-8 shrink-0 items-stretch rounded-md bg-[var(--accent)] ${docActions.creating ? "opacity-60" : ""}`}
      >
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-l-md bg-[var(--accent)] pl-3 pr-2.5 text-[12.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)]"
          onClick={() => void docActions.createDoc()}
          disabled={docActions.creating}
        >
          {docActions.creating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <FilePlus2 size={13} />
          )}
          新建文章
        </button>
        {/* 半透明细线把两段分开，底色仍是同一块 accent，看着还是一颗按钮 */}
        <span className="w-px shrink-0 bg-[var(--accent-fg)]/25" />
        <button
          className="flex w-7 cursor-pointer items-center justify-center rounded-r-md bg-[var(--accent)] text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)]"
          data-menu-trigger
          title="导入"
          onClick={toggle}
        >
          <ChevronDown size={13} />
        </button>
      </div>

      {anchor
        ? createPortal(
            <div
              ref={panelRef}
              className={menuPanelCls}
              style={{ top: anchor.top, right: anchor.right, width: MENU_WIDTH }}
            >
              <button className={menuItemCls} onClick={openImport("file")}>
                <FileInput size={13} className="text-[var(--ink-faint)]" />
                导入文件
              </button>
              <button className={menuItemCls} onClick={openImport("folder")}>
                <FolderInput size={13} className="text-[var(--ink-faint)]" />
                导入文件夹
              </button>
              {/* 飞书导入走服务端，未登录（本地模式）时没有这条路 */}
              {auth.loggedIn ? (
                <>
                  <div className="my-1 border-t border-[var(--hairline)]" />
                  <button className={menuItemCls} onClick={run(dialogs.openFeishu)}>
                    <BookDown size={13} className="text-[var(--ink-faint)]" />
                    飞书知识库导入
                  </button>
                </>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
