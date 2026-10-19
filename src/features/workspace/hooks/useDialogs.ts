"use client";

import { useCallback, useState } from "react";
import type { ImportMode } from "./useImportDocs";

/** One import request: mode decides whether to pick files or a whole folder;
 *  cat is the explicit target (set when started from a folder's context menu); without it, follow the current category */
export interface ImportRequest {
  mode: ImportMode;
  cat?: string;
}

/**
 * Open/close state for the workspace's global dialogs. Lives on ws rather than in Home:
 * import entry points are spread across the file tree context menu, the top-bar New button and the desktop shell's ?action=,
 * and keeping the state in Home would mean threading callbacks deep into the sidebar (which is exactly what we used to do).
 *
 * All callbacks are stabilized with useCallback: menu components put them into onClick closures,
 * and a new function every render would needlessly re-render the subtrees depending on them.
 */
export function useDialogs() {
  const [importRequest, setImportRequest] = useState<ImportRequest | null>(null);
  const [feishuOpen, setFeishuOpen] = useState(false);

  const openImport = useCallback(
    (mode: ImportMode, cat?: string) => setImportRequest({ mode, cat }),
    []
  );
  const closeImport = useCallback(() => setImportRequest(null), []);
  const openFeishu = useCallback(() => setFeishuOpen(true), []);
  const closeFeishu = useCallback(() => setFeishuOpen(false), []);

  return { importRequest, openImport, closeImport, feishuOpen, openFeishu, closeFeishu };
}
