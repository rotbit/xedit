/**
 * 编辑器此刻真正挂着哪一篇。
 *
 * 关掉阅读器时 store 里的 docId 并不清空（本地草稿等逻辑依赖它留着），
 * 所以「store.docId === id」不等于「编辑器开着它」：阅读器已卸载时往 store 写内容，
 * 没有自动保存来落盘，改动会丢。待办写回这类编辑器之外的改写要以这里为准。
 */

let mountedDocId: string | null = null;

/** 由 useEditorSave 在挂载 / 切换 / 卸载时登记 */
export function setMountedDocId(id: string | null): void {
  mountedDocId = id;
}

export function isDocOpenInEditor(id: string): boolean {
  return mountedDocId !== null && mountedDocId === id;
}
