"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/Toast";
import { getMirrorMeta, saveMirrorLocal } from "@/lib/docStore";
import { UNCATEGORIZED } from "@/lib/docDefaults";
import { isLocalId, updateLocalDoc } from "@/lib/localDocs";
import { isPushInFlight } from "@/lib/sync";
import { isDocumentSaved, persistEditorDocument, type EditorDocument, type PersistResult } from "@/lib/editor/persistence";
import { useStore, type SaveState } from "@/store/useStore";

/** 保留两种入口的提示策略：手动保存失败显示待同步，自动保存在线失败显示错误。 */
function saveStateFor(result: PersistResult, manual: boolean): SaveState {
  switch (result) {
    case "draft":
    case "local": return "local";
    // 本地都写不进去，谈不上「已保存」也谈不上「待同步」；内容还在编辑器里等下一次尝试
    case "local-error": return "local-error";
    case "offline": return "pending";
    case "push-failed": return manual || !navigator.onLine ? "pending" : "error";
    case "synced": return "saved";
  }
}

/** 本地写失败只提醒一次，别让配额满的机器每隔几百毫秒弹一条 */
let localErrorNotified = false;

async function saveDocument(doc: EditorDocument, manual: boolean): Promise<PersistResult> {
  const result = await persistEditorDocument(doc, () => {
    if (useStore.getState().docId === doc.docId) useStore.getState().setSaveState("saving");
  });
  if (result === "local-error") {
    if (!localErrorNotified) {
      localErrorNotified = true;
      toast("本地保存失败，内容仍在编辑器中", "error");
    }
  } else {
    localErrorNotified = false;
  }
  const store = useStore.getState();
  // 往返期间用户切走了：状态行归新文章所有，旧结果不能往上盖
  if (store.docId !== doc.docId) return result;
  const state = saveStateFor(result, manual);
  // 往返期间又改了：这次确认的是旧内容，别显示「已保存」误导人，
  // 交给紧跟着的下一次自动保存去定状态
  const edited =
    store.title !== doc.title || store.content !== doc.content || store.category !== doc.category;
  if (state === "saved" && edited) return result;
  // 手动同步成功后继续显示保存中，等版本请求结束再提示；无文档草稿沿用现有状态。
  if (!manual || (result !== "synced" && result !== "draft")) {
    store.setSaveState(state);
  }
  return result;
}

/** 手动存档只在同步成功后请求，版本失败不会把已保存的正文标成失败。 */
async function saveManualVersion(id: string) {
  try {
    const response = await fetch(`/api/documents/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "manual" }),
    });
    await response.json().catch(() => ({}));
    // 成功不弹提示：标题下的保存状态已经说明了，toast 盖在正文上反而挡视线
    useStore.getState().setSaveState("saved");
  } catch {
    useStore.getState().setSaveState("saved");
    toast("已同步云端，版本存档失败", "error");
  }
}

async function saveNow() {
  const doc = useStore.getState();
  const result = await saveDocument(doc, true);
  switch (result) {
    // 成功类结果一律静默，只有出问题才打断用户
    case "draft":
    case "local":
    case "offline": return;
    // 本地写失败的提示已由 saveDocument 弹过（自动保存同样要提醒），这里不重复
    case "local-error": return;
    case "push-failed": return toast("云端暂不可达，已存本地稍后自动同步", "error");
    case "synced": return saveManualVersion(doc.docId!);
  }
}

/** keepalive 请求的正文上限：规范规定同一页面所有 keepalive 请求合计 64KB，
 *  超了浏览器直接拒发（还会同步抛错），不如提前放弃、把内容留给同步引擎慢慢推。 */
const KEEPALIVE_LIMIT = 64 * 1024;

/**
 * 页面即将隐藏/关闭时的兜底落盘。
 *
 * 输入要经 ~120ms 节流才进 store，自动保存又压着 500/800ms 防抖，这个窗口里关标签页
 * 或刷新，最后敲的几个字就没了。这里全程同步：pagehide 之后浏览器不保证再跑任何回调，
 * 任何 await / setTimeout 后面的代码都可能永远不执行。
 *
 * 全程静默：这一刻弹 toast 用户根本看不到，也不归档手动版本（那是 ⌘S 的语义）。
 */
function persistOnHide() {
  // 第一步：借 flushOnly 事件让编辑器把节流窗口里压着的最后一次输入吐进 store。
  // dispatchEvent 是同步调用，监听器（MarkdownEditor 的 pushChange.flush）返回时
  // store 里已经是最新正文；useEditorSave 自己的监听见到 flushOnly 会直接跳过。
  window.dispatchEvent(new CustomEvent("xedit:save-now", { detail: { flushOnly: true } }));

  const doc = useStore.getState();
  const { docId, title, content, category } = doc;
  // 已经落过盘就别白写一遍：云端文档会平白标脏、多推一次
  if (!docId || isDocumentSaved(doc)) return;

  if (isLocalId(docId)) {
    // Vault（磁盘文件夹）后端的写盘是异步的：内存缓存同步更新，真正落到文件要等
    // File System Access 的 Promise，pagehide 之后不一定跑得完 —— 尽力而为。
    // 浏览器 localStorage 后端是同步写，能保住。
    try {
      updateLocalDoc(docId, { title, content, category });
    } catch {
      // 存储写满：这一刻没法提示用户，只能放弃
    }
    return;
  }

  // 云端文档沿用 persistEditorDocument 的「本地优先」第一步：先写镜像并标脏，
  // 网络那半截换成下面的 keepalive 请求。写不进去就直接放弃，没有别的退路。
  try {
    saveMirrorLocal(docId, { title, content, category });
  } catch {
    return;
  }
  // 这里刻意不调 rememberSavedDocument：落盘基准一旦推平，回到前台后自动保存会认为
  // 「没有改动」而跳过云端推送，内容只能等同步引擎下一轮。保持脏值，正常那条链路照走。

  if (!navigator.onLine) return;
  // 同步引擎正推着这一篇：那一轮要么带的就是这份内容，要么会自动再跑一轮补上。
  // 这时再发 keepalive 就是同一篇两个请求抢着写，到达顺序还不保证，不如让路。
  if (isPushInFlight(docId)) return;
  // 冲突判定的基线：刚写完镜像，这里读到的就是这份本地副本派生自的服务端版本
  const base = getMirrorMeta(docId)?.baseUpdatedAt;
  const body = JSON.stringify({
    title,
    category: category.trim() || UNCATEGORIZED,
    content,
    ...(base ? { baseUpdatedAt: base } : {}),
  });
  // Blob 按 UTF-8 计字节：中文一个字 3 字节，不能拿字符串 length 当大小
  if (new Blob([body]).size > KEEPALIVE_LIMIT) return;
  // keepalive 让请求活过页面卸载。成功与否都不管：读不到响应就没法 markMirrorSynced，
  // 镜像继续脏着，下次同步引擎再推一遍（服务端是整篇覆盖，重复推没有副作用）。
  void fetch(`/api/documents/${docId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/** 管理保存触发时机与版本归档；文档加载完成后调用，保留同次提交中先装载再判脏的顺序。 */
export function useEditorSave() {
  const idleVersionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedThisSession = useRef(false);

  useEffect(() => () => {
    if (idleVersionTimer.current) clearTimeout(idleVersionTimer.current);
  }, []);

  // 页面离开时：先把还没落盘的正文存住（persistOnHide），再补一次自动存档；
  // 服务端负责自动版本的节流与改动量门槛。
  useEffect(() => {
    const archiveVersion = () => {
      const id = useStore.getState().docId;
      if (!id || isLocalId(id) || !savedThisSession.current) return;
      if (!navigator.onLine || !navigator.sendBeacon) return;
      navigator.sendBeacon(
        `/api/documents/${id}/versions`,
        new Blob([JSON.stringify({ kind: "auto" })], { type: "application/json" })
      );
      savedThisSession.current = false;
    };
    const onPageHide = () => {
      persistOnHide();
      archiveVersion();
    };
    // visibilitychange 是移动端与「切走标签页后被系统回收」唯一可靠的信号：
    // 这些场景下 pagehide 常常根本不发。回到前台不用做什么，正常的防抖保存会接着跑。
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persistOnHide();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      // 切标签前的落盘只是借这条事件让编辑器把节流中的输入吐进 store，
      // 保存由发起方（useWorkspaceNav）就地完成，这里不该再弹提示、归档手动版本
      if ((e as CustomEvent<{ flushOnly?: boolean }>).detail?.flushOnly) return;
      void saveNow();
    };
    window.addEventListener("xedit:save-now", handler);
    return () => window.removeEventListener("xedit:save-now", handler);
  }, []);

  const docId = useStore((s) => s.docId);
  const title = useStore((s) => s.title);
  const content = useStore((s) => s.content);
  const category = useStore((s) => s.category);

  useEffect(() => {
    if (!docId) {
      // 装载 effect 可能在同一次提交中设好 docId，不能用旧的 null 覆盖已装载文档的状态。
      if (!useStore.getState().docId) useStore.getState().setSaveState("local");
      return;
    }
    const doc = { docId, title, content, category };
    if (isDocumentSaved(doc)) return;
    const timer = setTimeout(async () => {
      const result = await saveDocument(doc, false);
      if (result !== "synced") return;
      savedThisSession.current = true;
      // 停止编辑 5 分钟后存档；成功保存下一次编辑时重新计时。
      if (idleVersionTimer.current) clearTimeout(idleVersionTimer.current);
      idleVersionTimer.current = setTimeout(() => {
        void fetch(`/api/documents/${docId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "auto" }),
        }).catch(() => undefined);
      }, 5 * 60_000);
    }, isLocalId(docId) ? 500 : 800);
    return () => clearTimeout(timer);
  }, [docId, title, content, category]);
}
