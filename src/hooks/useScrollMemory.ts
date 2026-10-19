"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { scrollToLineRatio } from "@/lib/editor/scroll";
import { useThrottledCallback } from "@/hooks/useThrottledCallback";
import type { EditorHandle } from "@/lib/editor/types";

/**
 * Each article remembers "where you were reading": switching away and back, or refreshing, returns there instead of jumping to the top.
 *
 * Stores the (line, ratio within line) from reportScrollLine rather than scrollTop pixels:
 * window width, split view toggling, font size and live-rendered image heights all change pixel offsets, but not line numbers.
 *
 * Primarily an in-memory Map (zero cost when switching within a session), mirrored to sessionStorage so it survives a refresh;
 * session scope is enough: jumping halfway into a doc reopened days later feels odd, and it should be forgotten when the tab closes.
 */

/** sessionStorage key prefix; values are JSON {line, ratio} */
const KEY_PREFIX = "xedit:scroll:";
/** How many recent docs to remember at most: browsing hundreds of docs shouldn't keep bloating sessionStorage */
const MAX_DOCS = 50;
/** Write throttle window: scroll events fire dozens of times a second, ~4 writes/sec is plenty */
const WRITE_THROTTLE_MS = 250;

interface ScrollPos {
  /** Which line is at the top of the viewport (0-based, same convention as reportScrollLine / outline line numbers) */
  line: number;
  /** Offset ratio within that line; without it, long paragraphs or big images occupying one line would jump back a lot */
  ratio: number;
}

/** In-memory cache doubling as the LRU order: a Map iterates in insertion order, so delete-then-insert means "most recently used goes last" */
const memory = new Map<string, ScrollPos>();
let hydrated = false;

function parsePos(raw: string | null): ScrollPos | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ScrollPos>;
    // Treat anything from storage as untrusted: passing along a non-finite number would turn line math into NaN
    if (!Number.isFinite(v?.line) || !Number.isFinite(v?.ratio)) return null;
    return { line: v.line as number, ratio: v.ratio as number };
  } catch {
    return null;
  }
}

/**
 * Load sessionStorage records into memory before the first read/write.
 * Memory is empty after a refresh; without loading, old records can't be read or evicted by MAX_DOCS (the Map doesn't know they exist).
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
    // Private mode / storage disabled: fall back to memory-only, functionality unaffected
  }
}

function readPos(docId: string): ScrollPos | null {
  hydrate();
  return memory.get(docId) ?? null;
}

function writePos(docId: string, pos: ScrollPos) {
  hydrate();
  memory.delete(docId); // Delete then insert to move this doc to the end of the LRU
  memory.set(docId, pos);
  try {
    sessionStorage.setItem(KEY_PREFIX + docId, JSON.stringify(pos));
  } catch {
    // Storage full or disabled: the in-memory copy still works
  }
  while (memory.size > MAX_DOCS) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
    try {
      sessionStorage.removeItem(KEY_PREFIX + oldest);
    } catch {
      // Same as above; if removal fails, never mind
    }
  }
}

/**
 * @param docId Key for the memory
 * @param docKey Editor rebuild key (`docId:docVersion`): a change means the editor now holds new content
 * @param editorRef Gets the EditorView to convert line coordinates
 * @param scrollEl The outer container that actually scrolls (the scrollParent passed to MarkdownEditor)
 * @returns Recorder function to wire into the editor's onScrollLine
 */
export function useScrollMemory(
  docId: string,
  docKey: string,
  editorRef: RefObject<EditorHandle | null>,
  scrollEl: HTMLElement | null
) {
  /** Doc that has been restored and can start recording; nothing is recorded while it differs from the current docKey */
  const liveKeyRef = useRef<string | null>(null);

  // Pending writes carry their own docId: a write still in the throttle window when switching docs goes to the right doc
  const write = useThrottledCallback<{ id: string; pos: ScrollPos }>(
    ({ id, pos }) => writePos(id, pos),
    WRITE_THROTTLE_MS
  );

  // The reference changes per doc, but the editor stores onScrollLine in a ref refreshed every render, so a new reference doesn't trigger a rebuild
  const record = useCallback(
    (line: number, ratio: number) => {
      // Don't write back mid-switch (new docKey not restored yet) or for scrolls caused by restoring itself,
      // otherwise the initial "sitting at the top" right after loading would wipe the real record to 0
      if (liveKeyRef.current !== docKey) return;
      write({ id: docId, pos: { line, ratio } });
    },
    [docId, docKey, write]
  );

  // Restore: runs once after the content switches to a new doc.
  // scrollEl is a dependency because it becomes state via a callback ref and is still null in the editor's mount pass,
  // so the real work happens on the next pass once it's there; with unchanged deps it won't rerun, so restoring never interrupts the user's scrolling.
  // This effect runs after MarkdownEditor's mount effect (children before parents), so the EditorView already exists
  useEffect(() => {
    const view = editorRef.current?.view();
    if (!scrollEl || !view) return;

    // A background revalidation can rebuild the editor in place (docKey changes, same doc); the position just scrolled to may still be
    // in the throttle window, so flush it before reading to avoid picking up the previous coordinates
    write.flush();
    const saved = readPos(docId);
    const apply = () => {
      const v = editorRef.current?.view();
      if (!v) return;
      if (saved) scrollToLineRatio(v, scrollEl, saved.line, saved.ratio);
      // Docs with no record (new, first open) start from the top: the container is reused across docs,
      // so without an explicit reset it would keep the previous doc's scroll offset
      else scrollEl.scrollTo({ top: 0, behavior: "auto" });
    };
    apply();

    let correct = 0;
    // CodeMirror hasn't measured line heights yet at this point (especially live-rendered images and code block widgets),
    // so position again next frame with accurate heights; recording is re-enabled the frame after -- scroll events are dispatched
    // before rAF callbacks in the same frame, so the scroll from the correction lands before recording resumes and isn't written back
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
