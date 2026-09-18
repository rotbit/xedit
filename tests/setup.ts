import { beforeEach, vi } from "vitest";

/** 最小 localStorage 桩：同步、可计数、可注入写失败（配额满） */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  /** 测试可读的计数：索引读写次数等指标从这里来 */
  stats = { get: 0, set: 0, remove: 0 };
  /** 设为函数后，命中的 key 写入即抛（模拟 QuotaExceededError） */
  failSetIf: ((key: string) => boolean) | null = null;

  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(key: string) {
    this.stats.get++;
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.stats.set++;
    if (this.failSetIf?.(key)) {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    }
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.stats.remove++;
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  resetStats() {
    this.stats = { get: 0, set: 0, remove: 0 };
  }
}

export const storage = new MemoryStorage();

const g = globalThis as unknown as Record<string, unknown>;
// 只桩测试用得到的那几样；window 指向 globalThis 让 `typeof window` 判定成立
g.localStorage = storage;
g.window = globalThis;
if (!("document" in g)) {
  g.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
  };
}
if (!("navigator" in g) || !(g.navigator as { onLine?: boolean }).onLine) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, sendBeacon: () => true },
    configurable: true,
    writable: true,
  });
}
if (typeof g.CustomEvent === "undefined") {
  g.CustomEvent = class CustomEvent<T> extends Event {
    detail: T;
    constructor(type: string, init?: { detail?: T }) {
      super(type);
      this.detail = init?.detail as T;
    }
  };
}
if (typeof (g.window as { dispatchEvent?: unknown }).dispatchEvent !== "function") {
  const target = new EventTarget();
  g.addEventListener = target.addEventListener.bind(target);
  g.removeEventListener = target.removeEventListener.bind(target);
  g.dispatchEvent = target.dispatchEvent.bind(target);
}

beforeEach(() => {
  storage.clear();
  storage.resetStats();
  storage.failSetIf = null;
  vi.useRealTimers();
});
