"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LEVELS, getLevel, applyLevelSkin, type WritingLevel } from "@/lib/level";
import { useTotalChars } from "@/hooks/useTotalChars";
import { EvolutionCeremony } from "./EvolutionCeremony";

/**
 * 界面皮肤随墨灵等级自动进化（不可手动设置）：
 * - 登录后按墨力（累计字数 − 怠惰流失）应用等级皮肤，未登录回到 Lv1 朱砂
 * - 升级（含退化后夺回）时播放进化仪式
 * - ?evo=2..6 可预览进化动画，不影响记录
 */
export function LevelSkin() {
  const { status } = useSession();
  const exp = useTotalChars(status === "authenticated");
  const [ceremony, setCeremony] = useState<WritingLevel | null>(null);
  const previewRef = useRef(false);

  // 预览入口：临时套上对应皮肤一起看，关闭时还原
  useEffect(() => {
    const v = Number(new URLSearchParams(window.location.search).get("evo"));
    const lv = LEVELS.find((l) => l.lv === v && v >= 2);
    if (!lv) return;
    previewRef.current = true;
    document.documentElement.dataset.level = String(lv.lv);
    const t = setTimeout(() => setCeremony(lv), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      applyLevelSkin(1);
      return;
    }
    if (exp === null) return;
    const lv = getLevel(exp);
    applyLevelSkin(lv.lv);

    let seen = 0;
    try {
      seen = Number(localStorage.getItem("xedit-seen-level") || "0");
    } catch {
      // 忽略
    }
    if (lv.lv >= 2 && lv.lv > seen) {
      // 升级（或退化后夺回）：进化仪式
      const t = setTimeout(() => setCeremony(lv), 600);
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
        if (previewRef.current) {
          // 预览结束：还原到真实等级皮肤
          let stored = 1;
          try {
            stored = Number(localStorage.getItem("xedit-ui-level") || "1");
          } catch {
            // 忽略
          }
          if (stored >= 2 && stored <= 6) {
            document.documentElement.dataset.level = String(stored);
          } else {
            delete document.documentElement.dataset.level;
          }
        } else {
          try {
            localStorage.setItem("xedit-seen-level", String(ceremony.lv));
          } catch {
            // 忽略
          }
        }
        setCeremony(null);
      }}
    />
  );
}
