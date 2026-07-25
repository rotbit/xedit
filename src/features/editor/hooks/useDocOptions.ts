"use client";

import { useEffect, useState } from "react";

export interface DocOption {
  id: string;
  title: string;
}

/**
 * 顶栏两个下拉的数据源：可选分类（文章已用分类 ∪ 自建分类）与最近文章列表。
 * 仅登录且处于某篇文章中时拉取。
 */
export function useDocOptions(status: string, docId: string | null) {
  const [catList, setCatList] = useState<string[]>([]);
  const [docList, setDocList] = useState<DocOption[]>([]);

  useEffect(() => {
    if (status !== "authenticated" || !docId) return;
    let cancelled = false;
    void (async () => {
      const [docsRes, settingsRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/settings"),
      ]);
      if (cancelled) return;
      const set = new Set<string>(["未分类"]);
      if (docsRes.ok) {
        const list = await docsRes.json();
        for (const d of list) if (d.category) set.add(d.category);
        if (!cancelled) setDocList(list.map((d: DocOption) => ({ id: d.id, title: d.title })));
      }
      if (settingsRes.ok) {
        const st = await settingsRes.json();
        try {
          const extra = JSON.parse(st?.categories ?? "[]");
          if (Array.isArray(extra)) for (const c of extra) if (typeof c === "string") set.add(c);
        } catch {
          // 忽略脏数据
        }
      }
      if (!cancelled) setCatList(Array.from(set));
    })();
    return () => {
      cancelled = true;
    };
  }, [status, docId]);

  return { catList, docList, setCatList };
}
