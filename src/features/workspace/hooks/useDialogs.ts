"use client";

import { useCallback, useState } from "react";
import type { ImportMode } from "./useImportDocs";

/** 一次导入请求：mode 决定选文件还是选整个文件夹；
 *  cat 是指定的落点（右键某个文件夹发起时带上），不带就跟着当前分类走 */
export interface ImportRequest {
  mode: ImportMode;
  cat?: string;
}

/**
 * 工作台那几个全局弹窗的开关。挂在 ws 上而不是留在 Home 里：
 * 导入入口散在文件树右键菜单、顶栏新建按钮、桌面壳的 ?action= 三处，
 * 状态留在 Home 就得把回调一层层透传到侧栏深处（之前正是这么干的）。
 *
 * 回调全部 useCallback 稳住：菜单组件把它们塞进 onClick 闭包，
 * 每渲染换一份新函数会让依赖它们的子树白重渲一轮。
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
