"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  FilePlus2,
  Trash2,
  Loader2,
  PenLine,
  LogOut,
  LogIn,
  Search,
  MoreHorizontal,
  FolderOpen,
  Folder,
  FolderPlus,
  Inbox,
  ChevronRight,
  FileText,
  Images,
  Footprints,
  LayoutGrid,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronsUpDown,
  Settings2,
  Moon,
  Sun,
} from "lucide-react";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import {
  isLocalId,
  listLocalDocs,
  createLocalDoc,
  updateLocalDoc,
  deleteLocalDoc,
  listLocalCats,
  saveLocalCats,
} from "@/lib/localDocs";
import {
  listMirrorDocs,
  saveMirrorLocal,
  removeMirrorDoc,
  applyServerDoc,
  clearMirror,
  wasAuthed,
  setWasAuthed,
} from "@/lib/docStore";
import { startSync, syncNow, SYNC_DONE_EVENT } from "@/lib/sync";
import { useOnline } from "@/hooks/useOnline";
import { toast, Toaster } from "./Toast";
import { askInput, askConfirm } from "./PromptDialog";
import { openAuth } from "./AuthDialog";
import { DarkToggle, toggleDark } from "./DarkToggle";

/** 重型视图按需加载：阅读器连带 markdown 渲染/主题/复制管线，不该进首屏包 */
const viewLoading = () => (
  <div className="flex justify-center pt-24">
    <Loader2 size={20} className="animate-spin text-[var(--ink-faint)]" />
  </div>
);
const ArticleReader = dynamic(
  () => import("./ArticleReader").then((m) => m.ArticleReader),
  { ssr: false, loading: viewLoading }
);
const WritingStats = dynamic(
  () => import("./WritingStats").then((m) => m.WritingStats),
  { ssr: false, loading: viewLoading }
);
const AssetsGallery = dynamic(
  () => import("./AssetsGallery").then((m) => m.AssetsGallery),
  { ssr: false, loading: viewLoading }
);
const AiSettingsDialog = dynamic(
  () => import("./AiDialogs").then((m) => m.AiSettingsDialog),
  { ssr: false }
);
/* 落地页连带 13 套主题 CSS，只有首访未登录才需要，不进工作台首屏包 */
const Landing = dynamic(() => import("./Landing").then((m) => m.Landing), {
  ssr: false,
  loading: () => <div className="h-full bg-[var(--paper)]" />,
});

interface DocMeta {
  id: string;
  title: string;
  category?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
}

/** 登录态的文章列表 = 云端镜像 + 未上云的本地文档，全部来自本地存储（离线可用） */
function mergedCloudList(): DocMeta[] {
  return [...listLocalDocs(), ...listMirrorDocs()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

interface AppConfig {
  github: boolean;
  google: boolean;
  oss: boolean;
}

/** 账户菜单项样式 */
const accountItemCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";

const ALL = "__all__";
const TRASH = "__trash__";
const ASSETS = "__assets__";
const STATS = "__stats__";
const UNCATEGORIZED = "未分类";
const MAX_DEPTH = 3;

function formatTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

interface CatNode {
  name: string;
  path: string;
  children: CatNode[];
  docs: DocMeta[];
  count: number;
}

/** 由「父/子」路径构建分类树 */
function buildTree(docs: DocMeta[], customCats: string[]): CatNode[] {
  const roots: CatNode[] = [];
  const nodeMap = new Map<string, CatNode>();

  const ensure = (path: string): CatNode => {
    const existing = nodeMap.get(path);
    if (existing) return existing;
    const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
    const node: CatNode = { name, path, children: [], docs: [], count: 0 };
    nodeMap.set(path, node);
    if (path.includes("/")) {
      ensure(path.slice(0, path.lastIndexOf("/"))).children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  };

  for (const c of customCats) ensure(c);
  for (const d of docs) ensure(d.category || UNCATEGORIZED).docs.push(d);

  const fill = (n: CatNode): number => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    n.count = n.docs.length + n.children.reduce((s, c) => s + fill(c), 0);
    return n.count;
  };
  roots.forEach(fill);
  roots.sort((a, b) => {
    if (a.path === UNCATEGORIZED) return 1;
    if (b.path === UNCATEGORIZED) return -1;
    return a.name.localeCompare(b.name, "zh");
  });
  return roots;
}

export function Home() {
  const { data: session, status } = useSession();
  const loggedIn = status === "authenticated";
  const online = useOnline();
  /** 曾登录 + 离线：拿不到会话，但本地镜像数据齐全，按离线工作区处理而非落回本地模式 */
  const offlineAuthed = status === "unauthenticated" && !online && wasAuthed();
  /** 本地模式：未登录时工作台照常可用，数据存在浏览器本地（Obsidian 式本地优先） */
  const localMode = status === "unauthenticated" && !offlineAuthed;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeCat, setActiveCat] = useState<string>(ALL);
  // 编辑器返回时带 ?doc=<id>，直接落到该文章的阅读视图
  const [readingId, setReadingId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("doc");
  });
  const [search, setSearch] = useState("");
  /** 阅读视图下，ArticleReader 的操作按钮通过 portal 挂进面包屑顶栏右侧，省掉一整条横栏 */
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);
  /** 文档操作菜单：记录触发按钮的视口锚点，菜单用 fixed 定位避免被列表容器 overflow-hidden 裁剪 */
  const [docMenu, setDocMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [customCats, setCustomCats] = useState<string[]>([]);
  /** 头像账户菜单：贴着侧栏底部的触发行向上弹出 */
  const [accountMenu, setAccountMenu] = useState<{
    bottom: number;
    left: number;
    width: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 分类操作菜单：侧栏可滚动，菜单用 fixed 定位记录触发按钮的视口锚点 */
  const [catMenu, setCatMenu] = useState<{ path: string; top: number; left: number } | null>(
    null
  );
  // Notion 式侧栏：可折叠，状态本地记忆；窄屏为抽屉模式，默认收起
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.innerWidth < 768) return false;
    try {
      return localStorage.getItem("xedit-sidebar-open") !== "0";
    } catch {
      return true;
    }
  });
  const [trashDocs, setTrashDocs] = useState<DocMeta[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("xedit-cat-expanded");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  // 「全部文章」根节点默认展开
  const [rootOpen, setRootOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem("xedit-root-open") !== "0";
    } catch {
      return true;
    }
  });
  // 文章列表展示方式：卡片 / 列表
  const [docView, setDocView] = useState<"card" | "list">(() => {
    if (typeof window === "undefined") return "card";
    try {
      return localStorage.getItem("xedit-doc-view") === "list" ? "list" : "card";
    } catch {
      return "card";
    }
  });
  const migratedRef = useRef(false);

  // 本地模式：文章与分类都从本地库读；渲染期间带守卫地装载（React 推荐模式）
  const [localLoaded, setLocalLoaded] = useState(false);
  if (localMode && !localLoaded) {
    setLocalLoaded(true);
    setDocs(listLocalDocs());
    setCustomCats(listLocalCats());
  }

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  // 编辑器返回时带 ?doc=<id>：客户端导航下 window.location 有时序竞态，
  // 从 useSearchParams 读取；渲染期间带守卫地调整状态（React 推荐模式），地址栏清理放 effect
  const urlDoc = searchParams.get("doc");
  const [consumedUrlDoc, setConsumedUrlDoc] = useState<string | null>(null);
  if (urlDoc && urlDoc !== consumedUrlDoc) {
    setConsumedUrlDoc(urlDoc);
    setReadingId(urlDoc);
  }
  useEffect(() => {
    if (urlDoc) window.history.replaceState(null, "", "/");
  }, [urlDoc]);

  // 自建分类（允许空分类存在）
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    void fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((st) => {
        if (cancelled || !st) return;
        try {
          const list = JSON.parse(st.categories ?? "[]");
          if (Array.isArray(list)) {
            setCustomCats(list.filter((c: unknown): c is string => typeof c === "string"));
          }
        } catch {
          // 忽略脏数据
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // 完全本地优先：登录态列表先从本地镜像（+待上云的本地文档）秒出——
  // 渲染期间带守卫地装载（React 推荐模式），同步引擎每轮完成后再刷新
  const [cloudLoaded, setCloudLoaded] = useState(false);
  if ((loggedIn || offlineAuthed) && !cloudLoaded) {
    setCloudLoaded(true);
    setDocs(mergedCloudList());
  }

  useEffect(() => {
    if (!loggedIn && !offlineAuthed) return;
    if (loggedIn) setWasAuthed();
    const refresh = () => {
      setDocs(mergedCloudList());
      // 首次登录且云端为空：迁移旧的单篇本地草稿（或播种欢迎文档）
      if (
        loggedIn &&
        !migratedRef.current &&
        listMirrorDocs().length === 0 &&
        listLocalDocs().length === 0
      ) {
        migratedRef.current = true;
        const s = useStore.getState();
        const hasLocalWork =
          s.docId === null && s.content.trim() && s.content !== DEFAULT_MARKDOWN;
        void fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            hasLocalWork
              ? { title: s.title, content: s.content }
              : { title: "欢迎使用 xEdit", content: DEFAULT_MARKDOWN }
          ),
        })
          .then((res) => {
            if (res.ok) {
              if (hasLocalWork) toast("本地文稿已同步到云端", "success");
              void syncNow();
            }
          })
          .catch(() => undefined);
      }
    };
    window.addEventListener(SYNC_DONE_EVENT, refresh);
    const stop = startSync();
    return () => {
      window.removeEventListener(SYNC_DONE_EVENT, refresh);
      stop();
    };
  }, [loggedIn, offlineAuthed]);

  // 回收站列表（进入回收站时拉取）
  useEffect(() => {
    if (activeCat !== TRASH || !loggedIn) return;
    let cancelled = false;
    void fetch("/api/documents?trash=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!cancelled) setTrashDocs(list);
      })
      .catch(() => {
        if (!cancelled) setTrashDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCat, loggedIn]);

  const tree = useMemo(() => buildTree(docs ?? [], customCats), [docs, customCats]);
  const totalChars = useMemo(
    () => (docs ?? []).reduce((s, d) => s + (d.chars ?? 0), 0),
    [docs]
  );
  const isTrash = activeCat === TRASH;

  const filtered = useMemo(() => {
    const source = isTrash ? trashDocs : docs;
    return (source ?? []).filter((d) => {
      const cat = d.category || UNCATEGORIZED;
      if (!isTrash && activeCat !== ALL && cat !== activeCat && !cat.startsWith(`${activeCat}/`))
        return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          d.title.toLowerCase().includes(q) || (d.excerpt ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [docs, trashDocs, isTrash, activeCat, search]);

  const persistExpanded = (next: Set<string>) => {
    setExpanded(next);
    try {
      localStorage.setItem("xedit-cat-expanded", JSON.stringify(Array.from(next)));
    } catch {
      // 忽略
    }
  };

  const toggleExpand = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    persistExpanded(next);
  };

  const toggleRoot = () => {
    setRootOpen((v) => {
      try {
        localStorage.setItem("xedit-root-open", v ? "0" : "1");
      } catch {
        // 忽略
      }
      return !v;
    });
  };

  const switchDocView = (v: "card" | "list") => {
    setDocView(v);
    try {
      localStorage.setItem("xedit-doc-view", v);
    } catch {
      // 忽略
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen((v) => {
      try {
        localStorage.setItem("xedit-sidebar-open", v ? "0" : "1");
      } catch {
        // 忽略
      }
      return !v;
    });
  };

  /** 窄屏抽屉：选定分类/文章后自动收起（桌面侧栏常驻，不受影响） */
  const closeDrawerOnMobile = () => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  /** 侧栏全局搜索：在阅读/足迹/图片库视图里输入时先切回文章列表 */
  const onSearch = (v: string) => {
    setSearch(v);
    if (!v) return;
    if (readingId) setReadingId(null);
    if (activeCat === STATS || activeCat === ASSETS) setActiveCat(ALL);
  };

  const openCategory = (path: string) => {
    setActiveCat(path);
    setReadingId(null);
    setSearch("");
    closeDrawerOnMobile();
    if (path !== ALL && path !== TRASH && path !== ASSETS && path !== STATS) {
      // 展开路径上的所有节点
      const next = new Set(expanded);
      const parts = path.split("/");
      for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join("/"));
      persistExpanded(next);
    }
  };

  const openDoc = (id: string) => {
    // 回收站视图渲染不了阅读器，切回常规视图再打开
    if (activeCat === TRASH) setActiveCat(ALL);
    setReadingId(id);
    setDocMenu(null);
    closeDrawerOnMobile();
  };

  const createDoc = async (category?: string) => {
    const cat =
      category ??
      (activeCat === ALL || activeCat === TRASH || activeCat === ASSETS || activeCat === STATS
        ? UNCATEGORIZED
        : activeCat);
    if (localMode) {
      try {
        const doc = createLocalDoc({ category: cat });
        setDocs(listLocalDocs());
        openDoc(doc.id);
      } catch {
        toast("新建失败：浏览器存储空间不足", "error");
      }
      return;
    }
    // 登录但离线：先建成本地文档直接开写，联网后由同步引擎自动上云
    if (!online) {
      try {
        const doc = createLocalDoc({ category: cat });
        setDocs(mergedCloudList());
        openDoc(doc.id);
      } catch {
        toast("新建失败：浏览器存储空间不足", "error");
      }
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "未命名文章", content: "", category: cat }),
      });
      if (!res.ok) throw new Error();
      const doc = await res.json();
      applyServerDoc(doc); // 新文档立即入镜像，编辑页/离线随时可用
      setDocs(mergedCloudList());
      openDoc(doc.id);
      setCreating(false);
    } catch {
      toast("新建失败", "error");
      setCreating(false);
    }
  };

  const removeDoc = async (doc: DocMeta) => {
    if (localMode) {
      const ok = await askConfirm({
        title: "删除文章",
        message: `删除「${doc.title || "未命名文章"}」？本地文章删除后无法找回。`,
        confirmText: "删除",
        danger: true,
      });
      if (!ok) return;
      deleteLocalDoc(doc.id);
      setDocs(listLocalDocs());
      if (readingId === doc.id) setReadingId(null); // 删的是正打开的文章：退回列表，避免残留空白阅读器
      toast("已删除", "success");
      return;
    }
    if (!online) {
      toast("离线时无法删除云端文章，联网后再试", "error");
      return;
    }
    const ok = await askConfirm({
      title: "删除文章",
      message: `把「${doc.title || "未命名文章"}」移入回收站？可随时恢复。`,
      confirmText: "移入回收站",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      removeMirrorDoc(doc.id);
      setDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      if (readingId === doc.id) setReadingId(null);
      toast("已移入回收站", "success");
    } else {
      toast("删除失败", "error");
    }
  };

  const restoreDoc = async (doc: DocMeta) => {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (res.ok) {
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      // 恢复的文章由同步引擎拉回镜像并刷新列表
      void syncNow();
      toast("已恢复", "success");
    } else {
      toast("恢复失败", "error");
    }
  };

  const hardDeleteDoc = async (doc: DocMeta) => {
    const ok = await askConfirm({
      title: "彻底删除",
      message: `彻底删除「${doc.title || "未命名文章"}」？包括全部版本历史，无法找回。`,
      confirmText: "彻底删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}?hard=1`, { method: "DELETE" });
    if (res.ok) {
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      toast("已彻底删除", "success");
    } else {
      toast("删除失败", "error");
    }
  };

  const moveDoc = async (doc: DocMeta, category: string) => {
    if (localMode || isLocalId(doc.id)) {
      updateLocalDoc(doc.id, { category });
      setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, category } : d)) ?? null);
      toast(`已移动到「${category}」`, "success");
      return;
    }
    // 本地优先：先落镜像（离线同样生效），由同步引擎推送云端
    saveMirrorLocal(doc.id, { category });
    setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, category } : d)) ?? null);
    toast(`已移动到「${category}」`, "success");
    void syncNow();
  };

  const moveToNewCategory = async (doc: DocMeta) => {
    const name = (
      await askInput({ title: "新建分类并移入", placeholder: "分类名称，可用 / 建子分类" })
    )?.trim();
    if (!name) return;
    void moveDoc(doc, name.slice(0, 100));
  };

  const persistCustomCats = (next: string[]) => {
    setCustomCats(next);
    if (localMode) {
      saveLocalCats(next);
      return;
    }
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: next }),
    });
  };

  const validNewPath = (path: string): boolean => {
    const parts = path.split("/").map((p) => p.trim());
    if (parts.some((p) => !p)) {
      toast("分类名不能为空", "error");
      return false;
    }
    if (parts.length > MAX_DEPTH) {
      toast(`最多支持 ${MAX_DEPTH} 级分类`, "error");
      return false;
    }
    return true;
  };

  const createCategory = async (parentPath?: string) => {
    const name = (
      await askInput({
        title: parentPath ? `在「${parentPath}」下新建子分类` : "新建分类",
        placeholder: parentPath ? "子分类名称" : "分类名称，可用 / 建子分类",
      })
    )?.trim();
    if (!name) return;
    const path = parentPath ? `${parentPath}/${name.replace(/\//g, "")}` : name;
    if (!validNewPath(path)) return;
    if (path === UNCATEGORIZED || customCats.includes(path)) {
      toast("分类已存在", "error");
      return;
    }
    persistCustomCats([...customCats, path]);
    openCategory(path);
  };

  const renameCategory = async (path: string) => {
    const oldName = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
    const name = (
      await askInput({ title: `重命名「${oldName}」`, defaultValue: oldName, confirmText: "重命名" })
    )
      ?.trim()
      .replace(/\//g, "");
    if (!name || name === oldName) return;
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const to = parent ? `${parent}/${name}` : name;
    if (to === UNCATEGORIZED) {
      toast("分类已存在", "error");
      return;
    }
    const remap = (c: string) =>
      c === path ? to : c.startsWith(`${path}/`) ? to + c.slice(path.length) : c;
    if (localMode) {
      for (const d of listLocalDocs()) {
        const cat = d.category || UNCATEGORIZED;
        if (remap(cat) !== cat) updateLocalDoc(d.id, { category: remap(cat) });
      }
      saveLocalCats(Array.from(new Set([...customCats.map(remap), to])));
    } else {
      if (!online) {
        toast("离线时分类操作暂不可用，联网后再试", "error");
        return;
      }
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", from: path, to }),
      });
      if (!res.ok) {
        toast("重命名失败", "error");
        return;
      }
    }
    setDocs(
      (prev) =>
        prev?.map((d) => ({ ...d, category: remap(d.category || UNCATEGORIZED) })) ?? null
    );
    setCustomCats((prev) => Array.from(new Set([...prev.map(remap), to])));
    if (activeCat === path || activeCat.startsWith(`${path}/`)) {
      setActiveCat(remap(activeCat));
    }
    toast("已重命名", "success");
  };

  const removeCategory = async (path: string) => {
    const ok = await askConfirm({
      title: "删除分类",
      message: `删除分类「${path}」及其子分类？其中的文章会移入「未分类」。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const inSub = (c: string) => c === path || c.startsWith(`${path}/`);
    if (localMode) {
      for (const d of listLocalDocs()) {
        if (inSub(d.category || UNCATEGORIZED)) updateLocalDoc(d.id, { category: UNCATEGORIZED });
      }
      saveLocalCats(customCats.filter((c) => !inSub(c)));
    } else {
      if (!online) {
        toast("离线时分类操作暂不可用，联网后再试", "error");
        return;
      }
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", from: path }),
      });
      if (!res.ok) {
        toast("删除失败", "error");
        return;
      }
    }
    setDocs(
      (prev) =>
        prev?.map((d) =>
          inSub(d.category || UNCATEGORIZED) ? { ...d, category: UNCATEGORIZED } : d
        ) ?? null
    );
    setCustomCats((prev) => prev.filter((c) => !inSub(c)));
    if (inSub(activeCat)) setActiveCat(ALL);
    toast("已删除分类", "success");
  };

  const handleLogin = () => openAuth("login");

  const localDraft = useStore((s) => s.content);
  const hasLocalDraft = Boolean(localDraft.trim()) && localDraft !== DEFAULT_MARKDOWN;

  /** 未登录直接写作：把旧版单篇草稿收编进本地文档库，否则新建一篇欢迎文档 */
  const startLocalWriting = () => {
    const s = useStore.getState();
    const hasDraft =
      s.docId === null && Boolean(s.content.trim()) && s.content !== DEFAULT_MARKDOWN;
    try {
      const doc = hasDraft
        ? createLocalDoc({ title: s.title, content: s.content })
        : createLocalDoc({ title: "欢迎使用 xEdit", content: DEFAULT_MARKDOWN });
      // 草稿已入库，清空旧缓冲，避免登录后被旧迁移逻辑重复上传
      if (hasDraft) s.setDoc({ id: null, title: "未命名文章", content: DEFAULT_MARKDOWN });
      setDocs(listLocalDocs());
      openDoc(doc.id);
    } catch {
      // 本地存储不可用时退回旧的单稿模式
      router.push("/edit");
    }
  };

  /* —— 侧栏 —— */

  const simpleRow = (
    key: string,
    label: string,
    count: number | null,
    icon: React.ReactNode
  ) => {
    const active = activeCat === key && !readingId;
    return (
      <button
        key={key}
        className={`flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${
          active
            ? "bg-[var(--sidebar-active)] font-medium text-[var(--accent-deep)]"
            : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
        }`}
        style={{ paddingLeft: "6px" }}
        onClick={() => openCategory(key)}
      >
        <span className="h-5 w-5 shrink-0" />
        <span className={active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>
          {icon}
        </span>
        <span className="ml-1 min-w-0 flex-1 truncate">{label}</span>
        {count !== null ? (
          <span
            className={`rounded-full px-1.5 text-[11px] ${
              active ? "bg-[var(--panel)]/70 text-[var(--accent-deep)]" : "text-[var(--ink-faint)]"
            }`}
          >
            {count}
          </span>
        ) : null}
      </button>
    );
  };

  const renderDocRow = (doc: DocMeta, depth: number) => {
    const active = readingId === doc.id;
    return (
      <div key={doc.id} className="group/doc relative">
        <button
          className={`flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[12.5px] transition-colors group-hover/doc:pr-7 ${
            active
              ? "bg-[var(--sidebar-active)] font-medium text-[var(--accent-deep)]"
              : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
          }`}
          style={{ paddingLeft: `${30 + depth * 14}px` }}
          onClick={() => openDoc(doc.id)}
          title={doc.title}
        >
          <FileText
            size={12}
            className={`shrink-0 ${active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
          />
          <span className="min-w-0 flex-1 truncate">{doc.title || "未命名文章"}</span>
        </button>
        <button
          className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600 group-hover/doc:block dark:hover:bg-red-950/40 dark:hover:text-red-400"
          title={`把「${doc.title || "未命名文章"}」移入回收站`}
          onClick={() => void removeDoc(doc)}
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  };

  const renderCatNode = (node: CatNode, depth: number): React.ReactNode => {
    const isOpen = expanded.has(node.path);
    const active = activeCat === node.path && !readingId;
    const hasChildren = node.children.length > 0 || node.docs.length > 0;
    const canManage = node.path !== UNCATEGORIZED;
    const canAddChild = node.path.split("/").length < MAX_DEPTH && node.path !== UNCATEGORIZED;

    return (
      <div key={node.path}>
        <div className="group/cat relative">
          <div
            className={`flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${
              active
                ? "bg-[var(--sidebar-active)] font-medium text-[var(--accent-deep)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
            }`}
            style={{ paddingLeft: `${6 + depth * 14}px` }}
            onClick={() => openCategory(node.path)}
          >
            <span
              className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--ink-faint)] hover:bg-[var(--hairline)]"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.path);
              }}
            >
              {hasChildren ? (
                <ChevronRight
                  size={12}
                  className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              ) : null}
            </span>
            <span className={active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>
              {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
            </span>
            <span className="ml-1 min-w-0 flex-1 truncate">{node.name}</span>
            <span
              className={`rounded-full px-1.5 text-[11px] group-hover/cat:hidden ${
                active ? "bg-[var(--panel)]/70 text-[var(--accent-deep)]" : "text-[var(--ink-faint)]"
              }`}
            >
              {node.count}
            </span>
          </div>
          <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center group-hover/cat:flex">
            <button
              className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)] hover:text-[var(--accent)]"
              title={`在「${node.name}」新建文章`}
              onClick={(e) => {
                e.stopPropagation();
                void createDoc(node.path);
              }}
            >
              <FilePlus2 size={13} />
            </button>
            {canAddChild ? (
              <button
                className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)] hover:text-[var(--accent)]"
                title={`在「${node.name}」下新建子分类`}
                onClick={(e) => {
                  e.stopPropagation();
                  void createCategory(node.path);
                }}
              >
                <FolderPlus size={13} />
              </button>
            ) : null}
            {canManage ? (
              <button
                className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)] hover:text-[var(--ink)]"
                title="管理分类"
                onClick={(e) => {
                  e.stopPropagation();
                  if (catMenu?.path === node.path) {
                    setCatMenu(null);
                    return;
                  }
                  const r = e.currentTarget.getBoundingClientRect();
                  setCatMenu({ path: node.path, top: r.bottom + 4, left: r.left });
                }}
              >
                <MoreHorizontal size={13} />
              </button>
            ) : null}
          </span>
          {catMenu?.path === node.path ? (
            createPortal(
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setCatMenu(null)}
                onWheel={() => setCatMenu(null)}
              />
              <div
                className="fixed z-40 w-40 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_10px_36px_rgba(0,0,0,0.16)]"
                style={{ top: catMenu.top, left: catMenu.left }}
              >
                <button
                  className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
                  onClick={() => {
                    setCatMenu(null);
                    void renameCategory(node.path);
                  }}
                >
                  <PenLine size={13} className="text-[var(--ink-faint)]" />
                  重命名
                </button>
                <button
                  className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  onClick={() => {
                    setCatMenu(null);
                    void removeCategory(node.path);
                  }}
                >
                  <Trash2 size={13} />
                  删除分类
                </button>
              </div>
            </>,
            document.body
            )
          ) : null}
        </div>
        {isOpen ? (
          <div>
            {node.children.map((c) => renderCatNode(c, depth + 1))}
            {node.docs.map((d) => renderDocRow(d, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  /** 文档操作菜单（卡片与列表共用）。portal 到 body：卡片的 rise/hover transform 会劫持
   *  fixed 定位的 containing block，导致菜单被 overflow-hidden 裁剪 */
  const renderDocMenu = (doc: DocMeta, cat: string) =>
    docMenu?.id === doc.id ? (
      createPortal(
        <>
        <div
          className="fixed inset-0 z-30"
          onClick={(e) => {
            e.stopPropagation();
            setDocMenu(null);
          }}
          onWheel={() => setDocMenu(null)}
          onTouchMove={() => setDocMenu(null)}
        />
        <div
          className="fixed z-40 w-48 overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_10px_36px_rgba(0,0,0,0.16)]"
          style={{
            top: docMenu.top,
            right: docMenu.right,
            maxHeight: `calc(100vh - ${docMenu.top + 12}px)`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
            onClick={() => {
              setDocMenu(null);
              openDoc(doc.id);
            }}
          >
            <PenLine size={13} className="text-[var(--ink-faint)]" />
            编辑
          </button>
          <p className="px-3.5 pb-1 pt-1.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
            移动到分类
          </p>
          {Array.from(
            new Set([...customCats, ...(docs ?? []).map((d) => d.category || UNCATEGORIZED)])
          )
            .filter((c) => c !== cat)
            .sort((a, b) => a.localeCompare(b, "zh"))
            .slice(0, 12)
            .map((c) => (
              <button
                key={c}
                className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
                onClick={() => {
                  setDocMenu(null);
                  void moveDoc(doc, c);
                }}
              >
                <Folder size={13} className="shrink-0 text-[var(--ink-faint)]" />
                <span className="truncate">{c}</span>
              </button>
            ))}
          <button
            className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
            onClick={() => {
              setDocMenu(null);
              void moveToNewCategory(doc);
            }}
          >
            <FolderPlus size={13} className="text-[var(--ink-faint)]" />
            新建分类…
          </button>
          <div className="my-1 border-t border-[var(--hairline)]" />
          <button
            className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => {
              setDocMenu(null);
              void removeDoc(doc);
            }}
          >
            <Trash2 size={13} />
            删除文章
          </button>
        </div>
        </>,
        document.body
      )
    ) : null;

  // 会话状态确认前（及本地文章列表读取前）不渲染，避免闪现登录页
  if (status === "loading" || (localMode && docs === null)) {
    return <div className="h-full bg-[var(--paper)]" />;
  }

  if (loggedIn || offlineAuthed || (localMode && (docs?.length ?? 0) > 0)) {
    /* ———— 工作台（云端或本地模式）：Notion 式应用框架 —— 全高灰色侧栏 + 面包屑顶栏 + 独立滚动内容区 ———— */
    const readingDoc = readingId ? ((docs ?? []).find((d) => d.id === readingId) ?? null) : null;
    const crumbCls =
      "max-w-[220px] cursor-pointer truncate rounded-md px-1.5 py-0.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";
    const crumbNow = "truncate px-1.5 py-0.5 text-[13px] font-medium text-[var(--ink)]";
    const crumbSep = <ChevronRight size={12} className="shrink-0 text-[var(--ink-faint)]" />;
    const catParts = activeCat.split("/");
    const inList = !readingId && activeCat !== STATS && activeCat !== ASSETS;

    return (
      <div className="flex h-full overflow-hidden bg-[var(--paper)]">
        {/* 窄屏抽屉的背板：点击关闭 */}
        {sidebarOpen ? (
          <div
            className="fixed inset-0 z-30 bg-black/30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        {/* 侧栏：桌面静态常驻；窄屏为 fixed 抽屉，关闭时滑出屏幕 */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[248px] shrink-0 flex-col bg-[var(--sidebar)] transition-transform duration-200 md:static md:translate-x-0 ${
            sidebarOpen ? "" : "-translate-x-full md:hidden"
          }`}
        >
            {/* 工作区头 */}
            <div className="flex h-12 shrink-0 items-center gap-2 pl-4 pr-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--seal)] text-[13px] font-bold text-white [font-family:var(--serif)]">
                稿
              </span>
              <span className="text-[14px] font-semibold tracking-wide [font-family:var(--serif)]">
                xEdit
              </span>
              <span className="flex-1" />
              <button
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
                title="收起侧栏"
                onClick={toggleSidebar}
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            {/* 全局搜索 */}
            <div className="shrink-0 px-3 pb-2 pt-0.5">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
                />
                <input
                  className="h-8 w-full rounded-md border border-[var(--hairline)] bg-[var(--panel)] pl-8 pr-2.5 text-[12.5px] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]"
                  placeholder={isTrash ? "搜索回收站…" : "搜索文章…"}
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                />
              </div>
            </div>
            {/* 文档树 */}
            <div className="flex shrink-0 items-center justify-between pl-4 pr-2.5">
              <span className="text-[11px] text-[var(--ink-faint)]">
                {docs === null
                  ? "同步中…"
                  : `${docs.length} 篇文章${totalChars > 0 ? ` · ${totalChars.toLocaleString()} 字` : ""}`}
              </span>
              <button
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--sidebar-active)] hover:text-[var(--accent-deep)] disabled:opacity-60"
                title="新建文章"
                onClick={() => void createDoc()}
                disabled={creating}
              >
                {creating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <FilePlus2 size={13} />
                )}
              </button>
            </div>
            <nav className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
                  {/* 根节点：全部文章，其余分类挂在它下面 */}
                  <div className="group/cat relative">
                    <div
                      className={`flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${
                        activeCat === ALL && !readingId
                          ? "bg-[var(--sidebar-active)] font-medium text-[var(--accent-deep)]"
                          : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
                      }`}
                      style={{ paddingLeft: "6px" }}
                      onClick={() => {
                        if (!rootOpen) toggleRoot();
                        openCategory(ALL);
                      }}
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--ink-faint)] hover:bg-[var(--hairline)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRoot();
                        }}
                      >
                        <ChevronRight
                          size={12}
                          className={`transition-transform ${rootOpen ? "rotate-90" : ""}`}
                        />
                      </span>
                      <span
                        className={
                          activeCat === ALL && !readingId
                            ? "text-[var(--accent)]"
                            : "text-[var(--ink-faint)]"
                        }
                      >
                        <Inbox size={14} />
                      </span>
                      <span className="ml-1 min-w-0 flex-1 truncate">全部文章</span>
                      <span
                        className={`rounded-full px-1.5 text-[11px] group-hover/cat:hidden ${
                          activeCat === ALL && !readingId
                            ? "bg-[var(--panel)]/70 text-[var(--accent-deep)]"
                            : "text-[var(--ink-faint)]"
                        }`}
                      >
                        {docs?.length ?? 0}
                      </span>
                    </div>
                    <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center group-hover/cat:flex">
                      <button
                        className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)] hover:text-[var(--accent)]"
                        title="新建文章"
                        onClick={(e) => {
                          e.stopPropagation();
                          void createDoc(UNCATEGORIZED);
                        }}
                      >
                        <FilePlus2 size={13} />
                      </button>
                      <button
                        className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)] hover:text-[var(--ink)]"
                        title="新建分类"
                        onClick={(e) => {
                          e.stopPropagation();
                          void createCategory();
                        }}
                      >
                        <FolderPlus size={13} />
                      </button>
                    </span>
                  </div>
                  {rootOpen ? tree.map((n) => renderCatNode(n, 1)) : null}
            </nav>
            {/* 工具 + 账户 */}
            <div className="shrink-0 border-t border-[var(--hairline)] px-2 pb-2 pt-1.5">
              {loggedIn ? (
                <>
                  {simpleRow(STATS, "写作足迹", null, <Footprints size={14} />)}
                  {simpleRow(ASSETS, "图片库", null, <Images size={14} />)}
                  {simpleRow(
                    TRASH,
                    "回收站",
                    trashDocs?.length ? trashDocs.length : null,
                    <Trash2 size={14} />
                  )}
                  <div className="mt-1.5 border-t border-[var(--hairline)] pt-1.5">
                    <button
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--sidebar-hover)]"
                      title="账户"
                      onClick={(e) => {
                        if (accountMenu) {
                          setAccountMenu(null);
                          return;
                        }
                        const r = e.currentTarget.getBoundingClientRect();
                        setAccountMenu({
                          bottom: window.innerHeight - r.top + 6,
                          left: r.left,
                          width: r.width,
                        });
                      }}
                    >
                      {session?.user?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={session.user.image}
                          alt="avatar"
                          className="h-6 w-6 shrink-0 rounded-full ring-1 ring-[var(--hairline-strong)]"
                        />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-active)] text-[11px] text-[var(--ink)]">
                          {(session?.user?.name ?? "U").slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--ink-soft)]">
                        {session?.user?.name ?? session?.user?.email}
                      </span>
                      <ChevronsUpDown size={13} className="shrink-0 text-[var(--ink-faint)]" />
                    </button>
                    {accountMenu
                      ? createPortal(
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setAccountMenu(null)}
                              onWheel={() => setAccountMenu(null)}
                            />
                            <div
                              className="fixed z-40 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_10px_36px_rgba(0,0,0,0.16)]"
                              style={{
                                bottom: accountMenu.bottom,
                                left: accountMenu.left,
                                width: Math.max(accountMenu.width, 186),
                              }}
                            >
                              <p className="truncate px-3.5 pb-1 pt-0.5 text-[11px] text-[var(--ink-faint)]">
                                {session?.user?.email ?? session?.user?.name}
                              </p>
                              <button
                                className={accountItemCls}
                                onClick={() => {
                                  setAccountMenu(null);
                                  toggleDark();
                                }}
                              >
                                <Moon size={13} className="text-[var(--ink-faint)] dark:hidden" />
                                <Sun
                                  size={13}
                                  className="hidden text-[var(--ink-faint)] dark:block"
                                />
                                <span className="dark:hidden">夜间模式</span>
                                <span className="hidden dark:block">日间模式</span>
                              </button>
                              <button
                                className={accountItemCls}
                                onClick={() => {
                                  setAccountMenu(null);
                                  setSettingsOpen(true);
                                }}
                              >
                                <Settings2 size={13} className="text-[var(--ink-faint)]" />
                                设置…
                              </button>
                              <div className="my-1 border-t border-[var(--hairline)]" />
                              <button
                                className={accountItemCls}
                                onClick={() => {
                                  setAccountMenu(null);
                                  // 登出即清空本地镜像，避免下一个账号看到上一个账号的文章
                                  clearMirror();
                                  void signOut();
                                }}
                              >
                                <LogOut size={13} className="text-[var(--ink-faint)]" />
                                退出登录
                              </button>
                            </div>
                          </>,
                          document.body
                        )
                      : null}
                  </div>
                </>
              ) : offlineAuthed ? (
                <div className="mt-1.5 flex items-center justify-between px-1.5 pt-1">
                  <span className="text-[11px] text-[var(--ink-faint)]">
                    离线中 · 联网后自动同步
                  </span>
                  <DarkToggle />
                </div>
              ) : (
                <>
                  {/* 本地模式：文章保存在本设备，登录后自动同步上云 */}
                  <button
                    className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--accent)] text-[12.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)]"
                    onClick={handleLogin}
                  >
                    <LogIn size={13} />
                    登录同步到云端
                  </button>
                  <div className="mt-2 flex items-center justify-between border-t border-[var(--hairline)] px-1.5 pt-2">
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      本地模式 · 数据保存在本设备
                    </span>
                    <DarkToggle />
                  </div>
                </>
              )}
            </div>
        </aside>

        {/* 内容区：面包屑顶栏 + 独立滚动 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-1 bg-[var(--panel)] px-4">
            {!sidebarOpen ? (
              <>
                {/* 窄屏：抽屉式打开，不改动桌面记忆的折叠状态 */}
                <button
                  className="mr-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] md:hidden"
                  title="打开侧栏"
                  onClick={() => setSidebarOpen(true)}
                >
                  <PanelLeftOpen size={15} />
                </button>
                <button
                  className="mr-1 hidden h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] md:flex"
                  title="展开侧栏"
                  onClick={toggleSidebar}
                >
                  <PanelLeftOpen size={15} />
                </button>
              </>
            ) : null}
            {readingDoc ? (
              <>
                <button className={crumbCls} onClick={() => openCategory(ALL)}>
                  全部文章
                </button>
                {readingDoc.category ? (
                  <>
                    {crumbSep}
                    <button
                      className={crumbCls}
                      onClick={() => openCategory(readingDoc.category!)}
                    >
                      {readingDoc.category}
                    </button>
                  </>
                ) : null}
                {crumbSep}
                <span className={crumbNow}>{readingDoc.title || "未命名文章"}</span>
              </>
            ) : activeCat === STATS ? (
              <span className={crumbNow}>写作足迹</span>
            ) : activeCat === ASSETS ? (
              <span className={crumbNow}>图片库</span>
            ) : isTrash ? (
              <span className={crumbNow}>回收站</span>
            ) : activeCat === ALL || readingId ? (
              <span className={crumbNow}>全部文章</span>
            ) : (
              <>
                <button className={crumbCls} onClick={() => openCategory(ALL)}>
                  全部文章
                </button>
                {catParts.map((p, i) => {
                  const path = catParts.slice(0, i + 1).join("/");
                  const last = i === catParts.length - 1;
                  return (
                    <span key={path} className="flex min-w-0 items-center gap-1">
                      {crumbSep}
                      {last ? (
                        <span className={crumbNow}>{p}</span>
                      ) : (
                        <button className={crumbCls} onClick={() => openCategory(path)}>
                          {p}
                        </button>
                      )}
                    </span>
                  );
                })}
              </>
            )}
            <span className="flex-1" />
            {inList && !isTrash ? (
              <>
                <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-[var(--hairline)] bg-[var(--panel)] p-0.5">
                  {(
                    [
                      ["card", LayoutGrid, "卡片视图"],
                      ["list", List, "列表视图"],
                    ] as const
                  ).map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors ${
                        docView === mode
                          ? "bg-[var(--accent-wash)] text-[var(--accent)]"
                          : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      }`}
                      title={label}
                      onClick={() => switchDocView(mode)}
                    >
                      <Icon size={13} />
                    </button>
                  ))}
                </div>
                <button
                  className="ml-2 flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12.5px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
                  onClick={() => void createDoc()}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <FilePlus2 size={13} />
                  )}
                  新建文章
                </button>
              </>
            ) : null}
            {readingId && !isTrash ? (
              // ArticleReader 的操作按钮 portal 到此处，与面包屑同处一行
              <div ref={setActionSlot} className="flex shrink-0 items-center gap-2" />
            ) : null}
          </div>
          {readingId && !isTrash ? (
            // 文章视图占满内容区高度：便于「双屏」左右各自独立滚动
            <ArticleReader
              docId={readingId}
              actionSlot={actionSlot}
              onOpenCategory={openCategory}
              onDelete={() => {
                const d = (docs ?? []).find((x) => x.id === readingId);
                if (d) void removeDoc(d);
              }}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[960px] px-4 pb-24 pt-6 sm:px-8">
              {activeCat === STATS ? (
                <WritingStats />
              ) : activeCat === ASSETS ? (
                <AssetsGallery ossConfigured={config?.oss ?? false} />
              ) : (
                <>
                  {(isTrash ? trashDocs : docs) === null ? (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-[164px] animate-pulse rounded-xl bg-[var(--panel)]/70 ring-1 ring-black/[0.04] dark:ring-white/10"
                          />
                        ))}
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--hairline-strong)] py-16">
                        <Inbox size={24} className="text-[var(--ink-faint)]" />
                        <p className="text-[13px] text-[var(--ink-faint)]">
                          {search
                            ? "没有匹配的文章"
                            : isTrash
                              ? "回收站是空的"
                              : activeCat === ALL
                                ? "还没有文章，点「新建文章」开始"
                                : `「${activeCat}」还没有文章`}
                        </p>
                      </div>
                    ) : docView === "list" && !isTrash ? (
                      <div className="rise mt-4 overflow-hidden rounded-xl bg-[var(--panel)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] dark:ring-white/10">
                        {filtered.map((doc) => {
                          const cat = doc.category || UNCATEGORIZED;
                          return (
                            <div
                              key={doc.id}
                              className="group relative flex cursor-pointer items-center gap-3 border-b border-[var(--hairline-soft)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[var(--paper)]"
                              onClick={() => openDoc(doc.id)}
                            >
                              <FileText
                                size={14}
                                className="shrink-0 text-[var(--ink-faint)]"
                              />
                              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--ink)] [font-family:var(--serif)]">
                                {doc.title || "未命名文章"}
                              </span>
                              <span className="hidden items-center gap-1 rounded-md bg-[var(--paper)] px-2 py-0.5 text-[11px] text-[var(--ink-soft)] group-hover:bg-[var(--panel)] sm:flex">
                                <Folder size={11} />
                                {cat}
                              </span>
                              <span className="hidden w-16 shrink-0 text-right text-[11.5px] text-[var(--ink-faint)] sm:block">
                                {typeof doc.chars === "number" ? `${doc.chars} 字` : ""}
                              </span>
                              <span className="w-[76px] shrink-0 text-right text-[11.5px] text-[var(--ink-faint)]">
                                {formatTime(doc.updatedAt)}
                              </span>
                              <button
                                className="invisible cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--panel)] hover:text-[var(--ink)] group-hover:visible [@media(hover:none)]:visible"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (docMenu?.id === doc.id) {
                                    setDocMenu(null);
                                    return;
                                  }
                                  const r = e.currentTarget.getBoundingClientRect();
                                  setDocMenu({
                                    id: doc.id,
                                    top: r.bottom + 4,
                                    right: window.innerWidth - r.right,
                                  });
                                }}
                              >
                                <MoreHorizontal size={15} />
                              </button>
                              {renderDocMenu(doc, cat)}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {filtered.map((doc, i) => {
                          const cat = doc.category || UNCATEGORIZED;
                          return (
                            <div
                              key={doc.id}
                              className="rise group relative cursor-pointer rounded-xl bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] transition-all hover:shadow-[0_10px_28px_-12px_rgba(0,0,0,0.18)] hover:ring-black/[0.09] dark:ring-white/10 dark:hover:ring-white/20"
                              style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
                              onClick={() => {
                                if (!isTrash) openDoc(doc.id);
                              }}
                            >
                              <span className="absolute bottom-5 left-0 top-5 w-[3px] rounded-r-full bg-transparent transition-colors group-hover:bg-[var(--accent)]" />
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1.5 rounded-md bg-[var(--paper)] px-2 py-0.5 text-[11px] text-[var(--ink-soft)]">
                                  <Folder size={11} />
                                  {cat}
                                </span>
                                <span className="flex-1" />
                                <span className="text-[11.5px] text-[var(--ink-faint)]">
                                  {formatTime(doc.updatedAt)}
                                </span>
                                {isTrash ? null : (
                                  <button
                                    className="invisible cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)] group-hover:visible [@media(hover:none)]:visible"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (docMenu?.id === doc.id) {
                                        setDocMenu(null);
                                        return;
                                      }
                                      const r = e.currentTarget.getBoundingClientRect();
                                      setDocMenu({
                                        id: doc.id,
                                        top: r.bottom + 4,
                                        right: window.innerWidth - r.right,
                                      });
                                    }}
                                  >
                                    <MoreHorizontal size={15} />
                                  </button>
                                )}
                              </div>
                              <p className="mt-2.5 truncate pr-6 text-[15px] font-semibold leading-6 text-[var(--ink)] [font-family:var(--serif)]">
                                {doc.title || "未命名文章"}
                              </p>
                              <p className="mt-1 line-clamp-2 h-10 text-[12.5px] leading-5 text-[var(--ink-soft)]">
                                {doc.excerpt || "（暂无内容）"}
                              </p>
                              {isTrash ? (
                                <div className="mt-2.5 flex gap-2">
                                  <button
                                    className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-2.5 py-1 text-[12px] text-[var(--ink)] hover:bg-[var(--paper)]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void restoreDoc(doc);
                                    }}
                                  >
                                    恢复
                                  </button>
                                  <button
                                    className="cursor-pointer rounded-md px-2.5 py-1 text-[12px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void hardDeleteDoc(doc);
                                    }}
                                  >
                                    彻底删除
                                  </button>
                                </div>
                              ) : (
                                <p className="mt-2 text-[11.5px] text-[var(--ink-faint)]">
                                  {typeof doc.chars === "number" ? `${doc.chars} 字` : ""}
                                </p>
                              )}

                              {renderDocMenu(doc, cat)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
          )}
        </main>
        {/* 离线提示：登录态断网时改动全部落本地镜像，联网自动同步 */}
        {!online && !localMode ? (
          <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[var(--hairline)] bg-[var(--panel)] px-3.5 py-1.5 text-[12px] text-[var(--ink-soft)] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
            已离线 · 改动保存在本地，联网后自动同步
          </div>
        ) : null}
        {settingsOpen ? <AiSettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
        <Toaster />
      </div>
    );
  }

  /* ———— 未登录首访：产品落地页 ———— */
  return (
    <>
      <Landing onLogin={handleLogin} onStart={startLocalWriting} hasLocalDraft={hasLocalDraft} />
      <Toaster />
    </>
  );
}
