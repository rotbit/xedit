"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { scrollToLineRatio } from "@/lib/editor/scroll";
import { useThrottledCallback } from "@/hooks/useThrottledCallback";
import type { EditorHandle } from "@/lib/editor/types";

/**
 * 每篇文章各自记住「读到哪」：切走再切回、或刷新页面后回到原处，而不是一律弹回开头。
 *
 * 记的是 reportScrollLine 报上来的 (行号, 行内比例) 而不是 scrollTop 像素值：
 * 窗口宽度、双屏开合、字号、即时渲染的图片高度都会改变像素坐标，行号不会。
 *
 * 内存 Map 为主（同一次会话里切来切去零开销），同时镜像一份到 sessionStorage 供刷新后读；
 * 会话级足够：跨天再打开还跳到半截反而突兀，标签页一关就该忘掉。
 */

/** sessionStorage 的键前缀，值是 JSON 的 {line, ratio} */
const KEY_PREFIX = "xedit:scroll:";
/** 最多记最近多少篇：翻过几百篇之后不该把 sessionStorage 一直撑着 */
const MAX_DOCS = 50;
/** 落盘节流窗口：滚动事件一秒能来几十个，合并成 ~4 次/秒足够 */
const WRITE_THROTTLE_MS = 250;

interface ScrollPos {
  /** 视口顶端是第几行（0 基，与 reportScrollLine / 大纲行号同一口径） */
  line: number;
  /** 该行内部的偏移比例，长段落、大图占一行时少了它会往回跳一大截 */
  ratio: number;
}

/** 内存缓存兼 LRU 顺序表：Map 按插入序迭代，写入时先删后插就是「最近用过的排最后」 */
const memory = new Map<string, ScrollPos>();
let hydrated = false;

function parsePos(raw: string | null): ScrollPos | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ScrollPos>;
    // 存储里的东西一律当外来数据核一遍：非有限数往下传会让行号换算出 NaN
    if (!Number.isFinite(v?.line) || !Number.isFinite(v?.ratio)) return null;
    return { line: v.line as number, ratio: v.ratio as number };
  } catch {
    return null;
  }
}

/**
 * 首次读写前把 sessionStorage 里的记录捞进内存。
 * 刷新后内存是空的，不捞就既读不到旧记录，也没法按 MAX_DOCS 淘汰它们（Map 不知道它们存在）。
 */
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const pos = parsePos(sessionStorage.getItem(key));
      if (pos) memory.set(key.slice(KEY_PREFIX.length), pos);
    }
  } catch {
    // 无痕模式 / 禁用存储：退化成纯内存记忆，不影响功能
  }
}

function readPos(docId: string): ScrollPos | null {
  hydrate();
  return memory.get(docId) ?? null;
}

function writePos(docId: string, pos: ScrollPos) {
  hydrate();
  memory.delete(docId); // 先删后插，把这篇挪到 LRU 末尾
  memory.set(docId, pos);
  try {
    sessionStorage.setItem(KEY_PREFIX + docId, JSON.stringify(pos));
  } catch {
    // 存储写满或被禁用：内存那份仍然有效
  }
  while (memory.size > MAX_DOCS) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
    try {
      sessionStorage.removeItem(KEY_PREFIX + oldest);
    } catch {
      // 同上，删不掉就算了
    }
  }
}

/**
 * @param docId 记忆的键
 * @param docKey 编辑器的重建标识（`docId:docVersion`）：它一变就意味着编辑器里换了新内容
 * @param editorRef 取 EditorView 换算行坐标
 * @param scrollEl 真正滚动的外层容器（就是喂给 MarkdownEditor 的 scrollParent）
 * @returns 接到编辑器 onScrollLine 上的记录函数
 */
export function useScrollMemory(
  docId: string,
  docKey: string,
  editorRef: RefObject<EditorHandle | null>,
  scrollEl: HTMLElement | null
) {
  /** 已恢复到位、可以开始记录的文档；与当前 docKey 不等时一概不记 */
  const liveKeyRef = useRef<string | null>(null);

  // 待写值自带 docId：切文档时压在节流窗口里的那一次仍会落到它自己名下
  const write = useThrottledCallback<{ id: string; pos: ScrollPos }>(
    ({ id, pos }) => writePos(id, pos),
    WRITE_THROTTLE_MS
  );

  // 引用会随文档变，但编辑器把 onScrollLine 存在 ref 里、每次渲染刷新，换引用不触发重建
  const record = useCallback(
    (line: number, ratio: number) => {
      // 切档途中（新 docKey 还没恢复到位）和恢复自己引起的滚动都不回写，
      // 否则刚装载时那一下「停在顶部」会把真正的记录抹成 0
      if (liveKeyRef.current !== docKey) return;
      write({ id: docId, pos: { line, ratio } });
    },
    [docId, docKey, write]
  );

  // 恢复：内容换成新文档之后跑一次。
  // 依赖里带 scrollEl 是因为它由 callback ref 落成 state，编辑器挂载那一轮它还是 null，
  // 得等它就位的下一轮才真正开工；依赖没变就不会重跑，不存在恢复反过来打断用户滚动。
  // 本 effect 排在 MarkdownEditor 的挂载 effect 之后（子先父后），此时 EditorView 已建好
  useEffect(() => {
    const view = editorRef.current?.view();
    if (!scrollEl || !view) return;

    // 后台校新会在原地重建编辑器（docKey 变、文档没换），这时刚滚到的位置可能还压在
    // 节流窗口里，先吐出去再读，免得拿到上一次的旧坐标
    write.flush();
    const saved = readPos(docId);
    const apply = () => {
      const v = editorRef.current?.view();
      if (!v) return;
      if (saved) scrollToLineRatio(v, scrollEl, saved.line, saved.ratio);
      // 没记录过的（新建、第一次打开）从头读起：容器是跨文档复用的，
      // 不显式归零就会留着上一篇的滚动量
      else scrollEl.scrollTo({ top: 0, behavior: "auto" });
    };
    apply();

    let correct = 0;
    // 此刻 CodeMirror 还没量完行高（即时渲染的图片、代码块 widget 尤其），
    // 下一帧按量准的高度再定位一次；再下一帧才解禁记录 —— 滚动事件在同一帧的
    // rAF 回调之前派发，所以校正引起的那次滚动落在解禁之前，不会被写回去
    const first = requestAnimationFrame(() => {
      apply();
      correct = requestAnimationFrame(() => {
        liveKeyRef.current = docKey;
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (correct) cancelAnimationFrame(correct);
    };
  }, [docId, docKey, scrollEl, editorRef, write]);

  return record;
}
