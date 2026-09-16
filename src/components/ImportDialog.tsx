"use client";

import { useRef, useState } from "react";
import { FileInput, Loader2 } from "lucide-react";
import type {
  DocImporter,
  ImportMode,
  ImportResult,
} from "@/features/workspace/hooks/useImportDocs";
import { Modal, btnPrimary } from "./Modal";

/** 失败清单最多列这么多条，再多只报总数——弹窗不该被一个坏文件夹撑成长卷 */
const MAX_FAILED_SHOWN = 20;

/**
 * 导入本地 Markdown：选文件或选整个文件夹，一次性导入成文章。
 * 单向、手动触发，不是同步——重复导入按「同分类 + 同标题」幂等。
 */
export function ImportDialog({
  mode: initialMode,
  onClose,
  importer,
}: {
  mode: ImportMode;
  onClose: () => void;
  importer: DocImporter;
}) {
  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [result, setResult] = useState<ImportResult | null>(null);
  // 自己也记一份「跑着呢」：importer.importing 落回 false 与结果到手之间隔着一次渲染，
  // 只看它会闪回选择界面一帧
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { progress } = importer;
  // 关掉这个弹窗不会中断导入，但结果摘要就再也看不到了，所以跑着时先不给关
  const running = busy || importer.importing;

  /** 同一个隐藏 input 两用：点之前按当前模式改属性（webkitdirectory 是 DOM 属性，JSX 上没有类型） */
  const pick = () => {
    const el = inputRef.current;
    if (!el) return;
    el.webkitdirectory = mode === "folder";
    el.multiple = true;
    el.accept = mode === "folder" ? "" : ".md,.markdown";
    el.value = ""; // 清掉上次的选择，重选同一个文件夹也照样触发 change
    el.click();
  };

  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    if (files.length === 0) return;
    setBusy(true);
    const done = await importer.importFiles(files, mode);
    setBusy(false);
    setResult(done); // 与上一行同批提交，中间不会露出别的阶段
  };

  return (
    <Modal
      title="导入 Markdown"
      icon={<FileInput size={15} className="text-[var(--accent)]" />}
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
        <Pick mode={mode} targetCat={importer.targetCat} onSwitch={setMode} onPick={pick} />
      )}
    </Modal>
  );
}

/** 第一阶段：说明 + 选择入口，另给一个「改为导入文件夹 / 文件」的小切换 */
function Pick({
  mode,
  targetCat,
  onSwitch,
  onPick,
}: {
  mode: ImportMode;
  targetCat: string;
  onSwitch: (mode: ImportMode) => void;
  onPick: () => void;
}) {
  const folder = mode === "folder";
  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
        {folder
          ? "选一个文件夹，子文件夹会成为分类，文件名就是标题，正文里引用的本地图片会一并上传。"
          : `选一个或多个 .md 文件，导入到当前分类「${targetCat}」。`}
      </p>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={onPick}>
          {folder ? "选择文件夹…" : "选择文件…"}
        </button>
        <button
          className="cursor-pointer text-[12px] text-[var(--ink-faint)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
          onClick={() => onSwitch(folder ? "file" : "folder")}
        >
          {folder ? "改为导入文件" : "改为导入文件夹"}
        </button>
      </div>
      <p className="text-[12px] leading-5 text-[var(--ink-faint)]">
        重复导入不会产生重复文章：同分类同标题的会被更新。
      </p>
    </div>
  );
}

/** 第二阶段：进度 */
function Running({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-3">
      <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
      <p className="text-[13px] text-[var(--ink-soft)]">
        正在导入 {done} / {total}
      </p>
    </div>
  );
}

/** 第三阶段：结果摘要 */
function Done({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const { created, updated, skipped, failed, imageFailed } = result;
  const nothing = created + updated + skipped + failed.length === 0;
  return (
    <>
      <div className="flex flex-col gap-3 overflow-y-auto px-5 py-5">
        {nothing ? (
          <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
            没有可导入的文件：只认 .md / .markdown，以 . 开头的目录会跳过。
          </p>
        ) : (
          <p className="text-[13px] text-[var(--ink)]">
            新建 {created} · 更新 {updated} · 跳过 {skipped}
            {failed.length > 0 ? (
              <span className="text-red-600 dark:text-red-400"> · 失败 {failed.length}</span>
            ) : null}
          </p>
        )}
        {imageFailed > 0 ? (
          <p className="text-[12px] text-[var(--ink-faint)]">
            {imageFailed} 张图片上传失败，正文里保留了原始链接。
          </p>
        ) : null}
        {failed.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2">
            {failed.slice(0, MAX_FAILED_SHOWN).map((f, i) => (
              <li key={`${f.title}-${i}`} className="text-[12px] leading-5 text-[var(--ink-soft)]">
                <span className="text-[var(--ink)]">{f.title}</span> — {f.reason}
              </li>
            ))}
            {failed.length > MAX_FAILED_SHOWN ? (
              <li className="text-[12px] text-[var(--ink-faint)]">
                还有 {failed.length - MAX_FAILED_SHOWN} 篇失败未列出
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <div className="flex shrink-0 justify-end border-t border-[var(--hairline)] px-5 py-3">
        <button className={btnPrimary} onClick={onClose}>
          完成
        </button>
      </div>
    </>
  );
}
