"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 返回阅读态的目标地址，并绑定 ⌘E / Ctrl+E 快捷键（与阅读态的 ⌘E 互为往返）。
 * capture 阶段监听，抢在 CodeMirror 自身的按键处理之前。
 */
export function useBackToReader(status: string, docId: string | null): string {
  const router = useRouter();
  const href = docId && status === "authenticated" ? `/?doc=${docId}` : "/";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        router.push(href);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [href, router]);

  return href;
}
