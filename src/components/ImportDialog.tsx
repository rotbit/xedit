"use client";

import { useRef, useState } from "react";
import { FileInput, Loader2 } from "lucide-react";
import type {
  DocImporter,
  ImportMode,
  ImportResult,
} from "@/features/workspace/hooks/useImportDocs";
import { UNCATEGORIZED } from "@/lib/docDefaults";
import { Modal, btnPrimary } from "./Modal";
import { useT } from "@/i18n/useT";

/** Cap on listed failures; beyond this only the total is reported — one bad folder shouldn't turn the dialog into a scroll */
const MAX_FAILED_SHOWN = 20;

/**
 * Import local Markdown: pick files or a whole folder and import them as articles in one go.
 * One-way and manual, not a sync — re-importing is idempotent on "same category + same title".
 */
export function ImportDialog({
  mode: initialMode,
  targetCat,
  onClose,
  importer,
}: {
  mode: ImportMode;
  /** Target location (passed when import starts from a folder in the file tree); without it, imports go to the current category */
  targetCat?: string;
  onClose: () => void;
  importer: DocImporter;
}) {
  const t = useT();
  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Track "running" ourselves too: there's a render between importer.importing going false and the result arriving,
  // so relying on it alone flashes the picker screen for a frame
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { progress } = importer;
  // Closing this dialog doesn't stop the import, but the result summary would be lost, so it can't be closed while running
  const running = busy || importer.importing;

  /** One hidden input, two uses: set attributes per mode before clicking (webkitdirectory is a DOM attribute with no JSX typing) */
  const pick = () => {
    const el = inputRef.current;
    if (!el) return;
    el.webkitdirectory = mode === "folder";
    el.multiple = true;
    el.accept = mode === "folder" ? "" : ".md,.markdown";
    el.value = ""; // Clear the previous selection so re-picking the same folder still fires change
    el.click();
  };

  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    if (files.length === 0) return;
    setBusy(true);
    const done = await importer.importFiles(files, mode, targetCat);
    setBusy(false);
    setResult(done); // Committed in the same batch as the line above, so no other phase shows in between
  };

  return (
    <Modal
      // The title matches the menu item, so you see the one you came in through
      title={mode === "folder" ? t("导入文件夹") : t("导入文件")}
      icon={<FileInput size={16} className="text-[var(--accent)]" />}
      width={520}
      locked={running}
      onClose={onClose}
    >
      <input ref={inputRef} type="file" hidden onChange={(e) => void onPicked(e)} />

      {running ? (
        <Running done={progress.done} total={progress.total} />
      ) : result ? (
        <Done result={result} onClose={onClose} />
      ) : (
        <Pick
          mode={mode}
          targetCat={targetCat ?? importer.targetCat}
          // With a target set, name the folder explicitly; only without one is it 「当前分类」 (Current category) — the two are often different
          picked={targetCat !== undefined}
          onSwitch={setMode}
          onPick={pick}
        />
      )}
    </Modal>
  );
}

/** Phase one: explanation + pickers, plus a small 「改为导入文件夹 / 文件」 (Import folder / files instead) toggle */
function Pick({
  mode,
  targetCat,
  picked,
  onSwitch,
  onPick,
}: {
  mode: ImportMode;
  targetCat: string;
  /** The target was specified by the caller (right-clicked a folder), not inferred from the "current category" */
  picked: boolean;
  onSwitch: (mode: ImportMode) => void;
  onPick: () => void;
}) {
  const t = useT();
  const folder = mode === "folder";
  // 「未分类」 (Uncategorized) is a storage name translated only for display; other category names are user-chosen and shown as-is
  const cat = targetCat === UNCATEGORIZED ? t(UNCATEGORIZED) : targetCat;
  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
        {folder
          ? picked && targetCat !== UNCATEGORIZED
            ? t(
                "选一个文件夹，整个目录会放进「{cat}」，子文件夹会原样保留为文件夹，文件名就是标题，正文里引用的本地图片会一并上传。",
                { cat }
              )
            : t("选一个文件夹，子文件夹会原样保留为文件夹，文件名就是标题，正文里引用的本地图片会一并上传。")
          : picked
            ? t("选一个或多个 .md 文件，导入到文件夹「{cat}」。", { cat })
            : t("选一个或多个 .md 文件，导入到当前文件夹「{cat}」。", { cat })}
      </p>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={onPick}>
          {folder ? t("选择文件夹…") : t("选择文件…")}
        </button>
        <button
          className="cursor-pointer text-[12px] text-[var(--ink-faint)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
          onClick={() => onSwitch(folder ? "file" : "folder")}
        >
          {folder ? t("改为导入文件") : t("改为导入文件夹")}
        </button>
      </div>
      <p className="text-[12px] leading-5 text-[var(--ink-faint)]">
        {t("重复导入不会产生重复文章：同文件夹同标题的会被更新。")}
      </p>
    </div>
  );
}

/** Phase two: progress */
function Running({ done, total }: { done: number; total: number }) {
  const t = useT();
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-3">
      <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
      <p className="text-[13px] text-[var(--ink-soft)]">
        {t("正在导入 {done} / {total}", { done, total })}
      </p>
    </div>
  );
}

/** Phase three: result summary */
function Done({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const { created, updated, skipped, failed, imageFailed } = result;
  const nothing = created + updated + skipped + failed.length === 0;
  const t = useT();
  return (
    <>
      <div className="flex flex-col gap-3 overflow-y-auto px-5 py-5">
        {nothing ? (
          <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
            {t("没有可导入的文件：只认 .md / .markdown，以 . 开头的目录会跳过。")}
          </p>
        ) : (
          <p className="text-[13px] text-[var(--ink)]">
            {t("新建 {created} · 更新 {updated} · 跳过 {skipped}", { created, updated, skipped })}
            {failed.length > 0 ? (
              <span className="text-red-600 dark:text-red-400"> · {t("失败 {n}", { n: failed.length })}</span>
            ) : null}
          </p>
        )}
        {imageFailed > 0 ? (
          <p className="text-[12px] text-[var(--ink-faint)]">
            {t("{n} 张图片上传失败，正文里保留了原始链接。", { n: imageFailed })}
          </p>
        ) : null}
        {failed.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2">
            {failed.slice(0, MAX_FAILED_SHOWN).map((f, i) => (
              <li key={`${f.title}-${i}`} className="text-[12px] leading-5 text-[var(--ink-soft)]">
                <span className="text-[var(--ink)]">{f.title}</span> — {t(f.reason)}
              </li>
            ))}
            {failed.length > MAX_FAILED_SHOWN ? (
              <li className="text-[12px] text-[var(--ink-faint)]">
                {t("还有 {n} 篇失败未列出", { n: failed.length - MAX_FAILED_SHOWN })}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <div className="flex shrink-0 justify-end border-t border-[var(--hairline)] px-5 py-3">
        <button className={btnPrimary} onClick={onClose}>
          {t("完成")}
        </button>
      </div>
    </>
  );
}
