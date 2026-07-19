"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LEVELS, getLevel, type WritingLevel } from "@/lib/level";
import { useTotalChars } from "@/hooks/useTotalChars";
import { EvolutionCeremony } from "./EvolutionCeremony";

/**
 * 进化监听：登录后按墨力检测升级（含退化后夺回），播放进化仪式。
 * ?evo=2..6 或养成面板派发的 xedit-evo-preview 事件可预览动画，不影响记录。
 */
export function EvolutionWatcher() {
  const { status } = useSession();
  const exp = useTotalChars(status === "authenticated");
  const [ceremony, setCeremony] = useState<WritingLevel | null>(null);
  const previewRef = useRef(false);

  // 预览入口
  useEffect(() => {
    const onEvent = (e: Event) => {
      const lv = LEVELS.find((l) => l.lv === (e as CustomEvent<number>).detail);
      if (lv) {
        previewRef.current = true;
        setCeremony(lv);
      }
    };
    window.addEventListener("xedit-evo-preview", onEvent);
    const v = Number(new URLSearchParams(window.location.search).get("evo"));
    const fromUrl = LEVELS.find((l) => l.lv === v && v >= 2);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (fromUrl) {
      t = setTimeout(() => {
        previewRef.current = true;
        setCeremony(fromUrl);
      }, 300);
    }
    return () => {
      window.removeEventListener("xedit-evo-preview", onEvent);
      if (t) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || exp === null) return;
    const lv = getLevel(exp);
    let seen = 0;
    try {
      seen = Number(localStorage.getItem("xedit-seen-level") || "0");
    } catch {
      // 忽略
    }
    if (lv.lv >= 2 && lv.lv > seen) {
      // 升级（或退化后夺回）：进化仪式
      const t = setTimeout(() => {
        previewRef.current = false;
        setCeremony(lv);
      }, 600);
      return () => clearTimeout(t);
    }
    if (lv.lv !== seen) {
      // 退化或首次记录：静默同步，不办仪式
      try {
        localStorage.setItem("xedit-seen-level", String(lv.lv));
      } catch {
        // 忽略
      }
    }
  }, [status, exp]);

  if (!ceremony) return null;
  return (
    <EvolutionCeremony
      level={ceremony}
      onClose={() => {
        if (!previewRef.current) {
          try {
            localStorage.setItem("xedit-seen-level", String(ceremony.lv));
          } catch {
            // 忽略
          }
        }
        previewRef.current = false;
        setCeremony(null);
      }}
    />
  );
}
