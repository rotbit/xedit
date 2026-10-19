/**
 * Two things that recur in the cover picker, shared by CoverPicker and the AI generate tab (a wrong ratio won't match the WeChat backend).
 */
import type { CSSProperties } from "react";

/** Aspect ratio of a WeChat lead-article cover; roughly what you see is what you get (final cropping is up to the WeChat backend) */
export const COVER_RATIO: CSSProperties = { aspectRatio: "2.35 / 1" };

/** Clickable cover thumbnail tile */
export const coverTileCls =
  "relative cursor-pointer overflow-hidden rounded-md border border-[var(--hairline)] bg-[var(--accent-wash)] transition-colors hover:border-[var(--hairline-strong)] disabled:cursor-default";
