/**
 * 封面选择器里反复出现的两样东西，CoverPicker 与 AI 生成页签共用（比例写歪了就对不上后台）。
 */
import type { CSSProperties } from "react";

/** 公众号头条封面的比例，所见即大致所得（最终裁剪以后台为准） */
export const COVER_RATIO: CSSProperties = { aspectRatio: "2.35 / 1" };

/** 可点的封面缩略图方块 */
export const coverTileCls =
  "relative cursor-pointer overflow-hidden rounded-md border border-[var(--hairline)] bg-[var(--accent-wash)] transition-colors hover:border-[var(--hairline-strong)] disabled:cursor-default";
