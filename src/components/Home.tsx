"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  FilePlus2,
  Trash2,
  Loader2,
  PenLine,
  LogOut,
  Search,
  MoreHorizontal,
  FolderOpen,
  Folder,
  FolderPlus,
  Inbox,
  ChevronRight,
  FileText,
  Images,
  BarChart3,
} from "lucide-react";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import { THEME_PRESETS, BASE_CSS } from "@/lib/themes";
import { toast, Toaster } from "./Toast";
import { askInput, askConfirm } from "./PromptDialog";
import { WritingStats } from "./WritingStats";
import { AssetsGallery } from "./AssetsGallery";
import { ArticleReader } from "./ArticleReader";
import { GithubMark } from "./Topbar";

interface DocMeta {
  id: string;
  title: string;
  category?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
}

interface AppConfig {
  github: boolean;
  oss: boolean;
}

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

const FEATURES = [
  { title: "一键复制", desc: "样式全部内联，公众号 / 知乎直接粘贴，代码、公式、表格都不走样" },
  { title: "十三套主题", desc: "缩略图即见即所得，标注适用内容类型，支持自定义 CSS 叠加" },
  { title: "AI 助手", desc: "翻译、润色、AI 配图，发文前按公众号加热规则做内容审查" },
  { title: "云端同步", desc: "GitHub 登录后多篇分类管理、自动保存、版本定格与一键回滚" },
];

/** 主视觉：左 Markdown 源码、右真实主题渲染的双栏编辑器样机 */
function HeroMock() {
  const theme = THEME_PRESETS.find((t) => t.id === "wechat-green") ?? THEME_PRESETS[0];
  const css = useMemo(
    () => (BASE_CSS + theme.css).replaceAll("#nice", ".hero-demo"),
    [theme]
  );

  return (
    <div
      className="rise mx-auto mt-14 max-w-[840px] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-white shadow-[0_30px_80px_-24px_rgba(70,45,20,0.28)]"
      style={{ animationDelay: "0.2s" }}
    >
      <div className="flex h-9 items-center border-b border-[var(--hairline)] bg-[var(--paper)] px-4">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fc625d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#35cd4b]" />
        </span>
        <span className="mx-auto -translate-x-4 text-[11px] tracking-wider text-[var(--ink-faint)]">
          xEdit — 我的第一篇推文
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div
          className="hidden border-r border-[var(--hairline)] p-6 text-left text-[13px] leading-[2.1] sm:block"
          style={{ fontFamily: "var(--mono)" }}
        >
          <p>
            <span style={{ color: "var(--accent)" }}>##</span> 它能做什么
          </p>
          <p>
            <span style={{ color: "var(--accent)" }}>**</span>一键复制
            <span style={{ color: "var(--accent)" }}>**</span>到公众号
          </p>
          <p>
            <span style={{ color: "var(--ink-faint)" }}>-</span> 十三套排版主题
          </p>
          <p>
            <span style={{ color: "var(--ink-faint)" }}>-</span> AI 翻译、润色与配图
          </p>
          <p>
            <span style={{ color: "var(--accent)" }}>&gt;</span>{" "}
            <span style={{ color: "var(--ink-soft)" }}>云端同步，版本可回滚</span>
          </p>
        </div>
        <div className="p-3 text-left">
          <style>{css}</style>
          <div className="hero-demo" style={{ padding: "10px 20px 18px" }}>
            <h2 style={{ marginTop: 8, marginBottom: 14 }}>
              <span className="prefix" />
              <span className="content">它能做什么</span>
              <span className="suffix" />
            </h2>
            <p style={{ margin: "10px 0" }}>
              <strong>一键复制</strong>到公众号
            </p>
            <ul style={{ margin: "10px 0" }}>
              <li>十三套排版主题</li>
              <li>AI 翻译、润色与配图</li>
            </ul>
            <blockquote style={{ margin: "12px 0" }}>
              <p style={{ margin: "6px 0" }}>云端同步，版本可回滚</p>
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
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
  const router = useRouter();

  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [menuDocId, setMenuDocId] = useState<string | null>(null);
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [catMenu, setCatMenu] = useState<string | null>(null);
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
  const migratedRef = useRef(false);

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

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

  // 登录后拉取文章列表；云端为空时把本地文稿自动迁移上去
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    void (async () => {
      const load = async (): Promise<DocMeta[]> => {
        const res = await fetch("/api/documents");
        return res.ok ? res.json() : [];
      };
      let list = await load();
      if (cancelled) return;
      if (list.length === 0 && !migratedRef.current) {
        migratedRef.current = true;
        const s = useStore.getState();
        const hasLocalWork =
          s.docId === null && s.content.trim() && s.content !== DEFAULT_MARKDOWN;
        await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            hasLocalWork
              ? { title: s.title, content: s.content }
              : { title: "欢迎使用 xEdit", content: DEFAULT_MARKDOWN }
          ),
        });
        if (hasLocalWork) toast("本地文稿已同步到云端", "success");
        list = await load();
        if (cancelled) return;
      }
      setDocs(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

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

  const openCategory = (path: string) => {
    setActiveCat(path);
    setReadingId(null);
    setSearch("");
    if (path !== ALL && path !== TRASH && path !== ASSETS && path !== STATS) {
      // 展开路径上的所有节点
      const next = new Set(expanded);
      const parts = path.split("/");
      for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join("/"));
      persistExpanded(next);
    }
  };

  const openDoc = (id: string) => {
    setReadingId(id);
    setMenuDocId(null);
  };

  const createDoc = async (category?: string) => {
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "未命名文章",
          content: "",
          category:
            category ??
            (activeCat === ALL || activeCat === TRASH || activeCat === ASSETS || activeCat === STATS
              ? UNCATEGORIZED
              : activeCat),
        }),
      });
      if (!res.ok) throw new Error();
      const doc = await res.json();
      router.push(`/edit/${doc.id}`);
    } catch {
      toast("新建失败", "error");
      setCreating(false);
    }
  };

  const removeDoc = async (doc: DocMeta) => {
    const ok = await askConfirm({
      title: "删除文章",
      message: `把「${doc.title || "未命名文章"}」移入回收站？可随时恢复。`,
      confirmText: "移入回收站",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
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
      void fetch("/api/documents")
        .then((r) => (r.ok ? r.json() : null))
        .then((list) => {
          if (list) setDocs(list);
        });
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
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (res.ok) {
      setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, category } : d)) ?? null);
      toast(`已移动到「${category}」`, "success");
    } else {
      toast("移动失败", "error");
    }
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
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", from: path, to }),
    });
    if (!res.ok) {
      toast("重命名失败", "error");
      return;
    }
    const remap = (c: string) =>
      c === path ? to : c.startsWith(`${path}/`) ? to + c.slice(path.length) : c;
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
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", from: path }),
    });
    if (!res.ok) {
      toast("删除失败", "error");
      return;
    }
    const inSub = (c: string) => c === path || c.startsWith(`${path}/`);
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

  const handleLogin = () => {
    if (config && !config.github) {
      toast("尚未配置 GitHub OAuth，请在 .env 中填写 AUTH_GITHUB_ID/SECRET", "error");
      return;
    }
    void signIn("github");
  };

  const localDraft = useStore((s) => s.content);
  const hasLocalDraft = Boolean(localDraft.trim()) && localDraft !== DEFAULT_MARKDOWN;

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
        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${
          active
            ? "bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
            : "text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)]"
        }`}
        onClick={() => openCategory(key)}
      >
        <span className={active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== null ? (
          <span
            className={`rounded-full px-1.5 text-[11px] ${
              active ? "bg-white/70 text-[var(--accent-deep)]" : "text-[var(--ink-faint)]"
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
      <button
        key={doc.id}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[12.5px] transition-colors ${
          active
            ? "bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
            : "text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)]"
        }`}
        style={{ paddingLeft: `${26 + depth * 14}px` }}
        onClick={() => openDoc(doc.id)}
        title={doc.title}
      >
        <FileText
          size={12}
          className={`shrink-0 ${active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
        />
        <span className="min-w-0 flex-1 truncate">{doc.title || "未命名文章"}</span>
      </button>
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
            className={`flex w-full cursor-pointer items-center gap-1 rounded-lg py-1.5 pr-2 text-left text-[13px] transition-colors ${
              active
                ? "bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
                : "text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)]"
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
                active ? "bg-white/70 text-[var(--accent-deep)]" : "text-[var(--ink-faint)]"
              }`}
            >
              {node.count}
            </span>
          </div>
          <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center group-hover/cat:flex">
            <button
              className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent)]"
              title={`在「${node.name}」新建文章`}
              onClick={(e) => {
                e.stopPropagation();
                void createDoc(node.path);
              }}
            >
              <FilePlus2 size={13} />
            </button>
            {canManage ? (
              <button
                className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-white hover:text-[var(--ink)]"
                title="管理分类"
                onClick={(e) => {
                  e.stopPropagation();
                  setCatMenu(catMenu === node.path ? null : node.path);
                }}
              >
                <MoreHorizontal size={13} />
              </button>
            ) : null}
          </span>
          {catMenu === node.path ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setCatMenu(null)} />
              <div className="absolute left-2/3 top-full z-40 w-40 rounded-lg border border-[var(--hairline)] bg-white py-1.5 shadow-[0_10px_36px_rgba(40,30,10,0.16)]">
                {canAddChild ? (
                  <button
                    className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
                    onClick={() => {
                      setCatMenu(null);
                      void createCategory(node.path);
                    }}
                  >
                    <FolderPlus size={13} className="text-[var(--ink-faint)]" />
                    新建子分类
                  </button>
                ) : null}
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
                  className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setCatMenu(null);
                    void removeCategory(node.path);
                  }}
                >
                  <Trash2 size={13} />
                  删除分类
                </button>
              </div>
            </>
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

  return (
    <div className="desk relative h-full overflow-y-auto">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(192,57,43,0.07),transparent)]" />

      {/* 顶栏 */}
      <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--panel)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2.5 px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[14px] font-bold text-white shadow-[0_2px_6px_rgba(192,57,43,0.4)] [font-family:var(--serif)]">
            稿
          </span>
          <span className="text-[17px] font-semibold tracking-wide [font-family:var(--serif)]">
            xEdit
          </span>
          <span className="mt-0.5 hidden text-[12px] text-[var(--ink-faint)] sm:inline">
            Markdown 公众号排版
          </span>
          <span className="flex-1" />
          {loggedIn && session?.user ? (
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-soft)]">
                {session.user.name ?? session.user.email}
              </span>
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt="avatar"
                  className="h-7 w-7 rounded-full ring-1 ring-[var(--hairline-strong)]"
                />
              ) : null}
              <button
                className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                onClick={() => void signOut()}
                title="退出登录"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline-strong)] bg-white px-3 text-[13px] hover:bg-[var(--paper)]"
              onClick={handleLogin}
              disabled={status === "loading"}
            >
              <GithubMark size={14} />
              GitHub 登录
            </button>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-24">
        {loggedIn ? (
          /* ———— 已登录：文档树 + 内容区 ———— */
          <div className="pt-8">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[240px_1fr]">
              {/* 左：文档树 */}
              <aside className="rise md:sticky md:top-[76px] md:self-start">
                <p className="px-3 text-[11px] tracking-[0.35em] text-[var(--ink-faint)]">
                  WORKSPACE
                </p>
                <h1 className="mt-1.5 px-3 text-[22px] font-semibold leading-none [font-family:var(--serif)]">
                  我的文章
                </h1>
                <nav className="mt-5 flex flex-col gap-0.5">
                  {/* 根节点：全部文章，其余分类挂在它下面 */}
                  <div className="group/cat relative">
                    <div
                      className={`flex w-full cursor-pointer items-center gap-1 rounded-lg py-1.5 pr-2 text-left text-[13px] transition-colors ${
                        activeCat === ALL && !readingId
                          ? "bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
                          : "text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)]"
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
                            ? "bg-white/70 text-[var(--accent-deep)]"
                            : "text-[var(--ink-faint)]"
                        }`}
                      >
                        {docs?.length ?? 0}
                      </span>
                    </div>
                    <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center group-hover/cat:flex">
                      <button
                        className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent)]"
                        title="新建文章"
                        onClick={(e) => {
                          e.stopPropagation();
                          void createDoc(UNCATEGORIZED);
                        }}
                      >
                        <FilePlus2 size={13} />
                      </button>
                      <button
                        className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-white hover:text-[var(--ink)]"
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
                <div className="mt-3 border-t border-[var(--hairline)] pt-2">
                  {simpleRow(STATS, "写作数据", null, <BarChart3 size={15} />)}
                  {simpleRow(ASSETS, "图片库", null, <Images size={15} />)}
                  {simpleRow(TRASH, "回收站", trashDocs?.length ?? 0, <Trash2 size={15} />)}
                </div>
                <p className="mt-4 px-3 text-[11.5px] leading-5 text-[var(--ink-faint)]">
                  点分类看列表，点文章看排版效果；悬停行尾可新建文章、分类
                </p>
              </aside>

              {/* 右：阅读视图 / 文章列表 */}
              <section className="min-w-0">
                {activeCat === STATS ? (
                  <WritingStats />
                ) : activeCat === ASSETS ? (
                  <AssetsGallery ossConfigured={config?.oss ?? false} />
                ) : readingId && !isTrash ? (
                  <ArticleReader docId={readingId} onOpenCategory={openCategory} />
                ) : (
                  <>
                    <div
                      className="rise flex items-center gap-3"
                      style={{ animationDelay: "0.05s" }}
                    >
                      <div className="relative flex-1">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
                        />
                        <input
                          className="h-9 w-full rounded-lg border border-[var(--hairline)] bg-white pl-9 pr-3 text-[13px] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
                          placeholder={
                            isTrash
                              ? "搜索回收站…"
                              : `搜索${activeCat === ALL ? "全部" : "「" + activeCat + "」"}文章…`
                          }
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                      <button
                        className={`flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(192,57,43,0.35)] hover:bg-[var(--accent-deep)] disabled:opacity-60 ${isTrash ? "hidden" : ""}`}
                        onClick={() => void createDoc()}
                        disabled={creating}
                      >
                        {creating ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <FilePlus2 size={14} />
                        )}
                        新建文章
                      </button>
                    </div>

                    {(isTrash ? trashDocs : docs) === null ? (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-[136px] animate-pulse rounded-xl border border-[var(--hairline)] bg-white/70"
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
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {filtered.map((doc, i) => {
                          const cat = doc.category || UNCATEGORIZED;
                          return (
                            <div
                              key={doc.id}
                              className="rise group relative cursor-pointer rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[0_1px_3px_rgba(60,50,30,0.04)] transition-all hover:-translate-y-1 hover:shadow-[0_14px_36px_-12px_rgba(60,45,20,0.22)]"
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
                                    className="invisible cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)] group-hover:visible"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuDocId(menuDocId === doc.id ? null : doc.id);
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
                                    className="cursor-pointer rounded-md px-2.5 py-1 text-[12px] text-red-600 hover:bg-red-50"
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

                              {/* 卡片菜单 */}
                              {menuDocId === doc.id ? (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuDocId(null);
                                    }}
                                  />
                                  <div
                                    className="absolute right-3 top-10 z-40 w-48 rounded-lg border border-[var(--hairline)] bg-white py-1.5 shadow-[0_10px_36px_rgba(40,30,10,0.16)]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
                                      onClick={() => {
                                        setMenuDocId(null);
                                        router.push(`/edit/${doc.id}`);
                                      }}
                                    >
                                      <PenLine size={13} className="text-[var(--ink-faint)]" />
                                      编辑
                                    </button>
                                    <p className="px-3.5 pb-1 pt-1.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
                                      移动到分类
                                    </p>
                                    {Array.from(
                                      new Set([
                                        ...customCats,
                                        ...(docs ?? []).map((d) => d.category || UNCATEGORIZED),
                                      ])
                                    )
                                      .filter((c) => c !== cat)
                                      .sort((a, b) => a.localeCompare(b, "zh"))
                                      .slice(0, 12)
                                      .map((c) => (
                                        <button
                                          key={c}
                                          className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
                                          onClick={() => {
                                            setMenuDocId(null);
                                            void moveDoc(doc, c);
                                          }}
                                        >
                                          <Folder
                                            size={13}
                                            className="shrink-0 text-[var(--ink-faint)]"
                                          />
                                          <span className="truncate">{c}</span>
                                        </button>
                                      ))}
                                    <button
                                      className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
                                      onClick={() => {
                                        setMenuDocId(null);
                                        void moveToNewCategory(doc);
                                      }}
                                    >
                                      <FolderPlus size={13} className="text-[var(--ink-faint)]" />
                                      新建分类…
                                    </button>
                                    <div className="my-1 border-t border-[var(--hairline)]" />
                                    <button
                                      className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
                                      onClick={() => {
                                        setMenuDocId(null);
                                        void removeDoc(doc);
                                      }}
                                    >
                                      <Trash2 size={13} />
                                      删除文章
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        ) : (
          /* ———— 未登录：产品首页 ———— */
          <>
            <div className="pt-20 text-center">
              <p className="rise text-[11px] tracking-[0.4em] text-[var(--ink-faint)]">
                XEDIT · 微信公众号排版工具
              </p>
              <h1
                className="rise mt-5 text-[44px] font-bold leading-tight [font-family:var(--serif)]"
                style={{ animationDelay: "0.06s" }}
              >
                Markdown 写作
                <span className="text-[var(--accent)]">，</span>
                公众号排版
                <span className="ml-4 inline-flex h-11 w-11 rotate-6 items-center justify-center rounded-lg bg-[var(--accent)] align-[6px] text-[22px] text-white shadow-[0_4px_12px_rgba(192,57,43,0.4)]">
                  稿
                </span>
              </h1>
              <p
                className="rise mx-auto mt-5 max-w-xl text-[15px] leading-7 text-[var(--ink-soft)]"
                style={{ animationDelay: "0.12s" }}
              >
                左侧写 Markdown，右侧实时预览，一键复制到微信公众号或知乎，样式不丢。
                主题、公式、AI 助手与云端同步，一站配齐。
              </p>
              <div
                className="rise mt-9 flex items-center justify-center gap-3"
                style={{ animationDelay: "0.16s" }}
              >
                <button
                  className="flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-[var(--accent)] px-6 text-[15px] font-medium text-white shadow-[0_4px_14px_rgba(192,57,43,0.35)] transition-transform hover:-translate-y-0.5 hover:bg-[var(--accent-deep)]"
                  onClick={() => router.push("/edit")}
                >
                  <PenLine size={16} />
                  {hasLocalDraft ? "继续编辑本地文稿" : "开始写作"}
                </button>
                <button
                  className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-white px-6 text-[15px] transition-transform hover:-translate-y-0.5 hover:bg-[var(--paper)]"
                  onClick={handleLogin}
                >
                  <GithubMark size={15} />
                  GitHub 登录
                </button>
              </div>
              <p
                className="rise mt-3.5 text-[12px] text-[var(--ink-faint)]"
                style={{ animationDelay: "0.2s" }}
              >
                无需登录即可使用全部排版功能；登录后解锁云端多篇管理与版本历史
              </p>
            </div>

            <HeroMock />

            <div
              className="rise mt-20 grid grid-cols-2 gap-x-0 gap-y-10 border-t-2 border-[var(--ink)] pt-9 lg:grid-cols-4"
              style={{ animationDelay: "0.3s" }}
            >
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className={`px-6 ${i % 2 === 0 ? "pl-0" : ""} lg:border-l lg:border-[var(--hairline)] lg:pl-6 lg:first:border-l-0 lg:first:pl-0`}
                >
                  <p className="text-[12px] font-medium tracking-widest text-[var(--accent)] [font-family:var(--mono)]">
                    0{i + 1}
                  </p>
                  <p className="mt-2.5 text-[16px] font-semibold [font-family:var(--serif)]">
                    {f.title}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-[1.7] text-[var(--ink-soft)]">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-24 text-center text-[11px] tracking-[0.25em] text-[var(--ink-faint)]">
              XEDIT — 写好内容，排好版面
            </p>
          </>
        )}
      </main>
      <Toaster />
    </div>
  );
}
