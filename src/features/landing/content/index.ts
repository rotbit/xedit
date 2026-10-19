import { en } from "./en";
import { ja } from "./ja";
import type { LandingCopy } from "./types";
import { zh } from "./zh";
import type { LandingLocale } from "../locales";

export type { LandingCopy } from "./types";
export type { LandingLocale } from "../locales";

const COPY: Record<LandingLocale, LandingCopy> = { zh, en, ja };

export function getLandingCopy(locale: LandingLocale = "zh"): LandingCopy {
  return COPY[locale];
}
