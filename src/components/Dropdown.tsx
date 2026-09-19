"use client";

import { useRef, useState } from "react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";

export function Dropdown({
  trigger,
  children,
  width = 220,
  align = "right",
  closeOnBlur = true,
}: {
  trigger: React.ReactNode;
  /** 传函数就能拿到「关面板」：要等异步做完（上传、生成）才收起面板的内容用得上 */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  width?: number;
  /** 菜单与触发器的对齐边：靠视口左缘的触发器用 left，避免菜单伸出屏幕 */
  align?: "left" | "right";
  /** 窗口失焦是否关闭：面板里要唤起系统文件选择框的传 false，否则一选文件面板就没了 */
  closeOnBlur?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 触发器也在 ref 里：按在它上面不由这里关，交给下面的 toggle（否则「先关再开」点了像没反应）
  const close = () => setOpen(false);
  useDismissMenu(ref, close, open, closeOnBlur);
  useEscape(close, open);

  return (
    <div className="relative shrink-0" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-[calc(100%+6px)] z-50 overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-md:fixed max-md:inset-x-2 max-md:top-[52px] max-md:w-auto!`}
          style={{
            width,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 64px)",
          }}
          onClick={() => setOpen(false)}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}
