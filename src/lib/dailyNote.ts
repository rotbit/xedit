/**
 * Daily notes (pure functions, no React), borrowed from Obsidian: one ordinary doc per day, titled with the date
 * (`2026-10-21`) and kept in the reserved 「日记」 category. Like templates, there's no separate entity —
 * delete, move, sync and search all reuse the doc's own machinery.
 */

import type { DocMeta } from "@/features/workspace/types";
import { defaultTitleFromTemplate, isTemplateDoc, listTemplates } from "@/lib/templates";
import { normalizeTitle } from "@/lib/wikiLink";

/** Category new daily notes go into; stored in Chinese like 「模板」 and translated only for display */
export const DAILY_CATEGORY = "日记"; // i18n-ignore reserved category name stored in data; displayed via t()

/** Template titles (after stripping 「模板」) that count as the daily-note template, compared case-insensitively */
const DAILY_TEMPLATE_NAMES = new Set(["日记", "每日笔记", "daily", "daily note", "daily notes"]); // i18n-ignore matched against user-written template titles

/**
 * Find the daily note for a day key (YYYY-MM-DD). Prefer one in the 「日记」 category; fall back to any non-template doc
 * with that exact title, so a note the user moved to another folder is still found instead of getting a duplicate.
 */
export function findDailyNote(docs: readonly DocMeta[] | null | undefined, day: string): DocMeta | null {
  const matches = (docs ?? []).filter((d) => !isTemplateDoc(d) && d.title.trim() === day);
  return matches.find((d) => d.category === DAILY_CATEGORY) ?? matches[0] ?? null;
}

/** The template a new daily note starts from: a doc in 「模板」 titled 「日记」 / 「日记模板」 / "Daily note" etc., or null for an empty note */
export function findDailyTemplate(docs: readonly DocMeta[] | null | undefined): DocMeta | null {
  return (
    listTemplates(docs).find((tpl) =>
      DAILY_TEMPLATE_NAMES.has(normalizeTitle(defaultTitleFromTemplate(tpl.title)))
    ) ?? null
  );
}
