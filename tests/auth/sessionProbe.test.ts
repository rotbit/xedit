import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthSnapshot, readAuthSnapshot, saveAuthSnapshot } from "@/lib/authSnapshot";
import { __resetProbeForTests, getProbeState, startProbing } from "@/lib/sessionProbe";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/Toast", () => ({ toast }));
vi.mock("next-auth/react", () => ({ getSession: vi.fn(async () => null) }));

const USER = { id: "u-a", email: "a@example.com" };

/** The probe's in-flight request: holds resolve/reject so we can answer whenever we like */
interface Pending {
  settle: (body: unknown, status?: number) => void;
  aborted: boolean;
}

function stubFetch(): { calls: number; last: () => Pending } {
  const pendings: Pending[] = [];
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      const p: Pending = {
        aborted: false,
        settle: (body, status = 200) =>
          resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response),
      };
      init?.signal?.addEventListener("abort", () => {
        p.aborted = true;
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
      pendings.push(p);
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    get calls() {
      return fetchMock.mock.calls.length;
    },
    last: () => pendings[pendings.length - 1],
  };
}

/** Drain pending microtasks (a single await isn't enough under fake timers) */
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  clearAuthSnapshot();
  toast.mockClear();
});

afterEach(() => {
  __resetProbeForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("会话探测", () => {
  it("超时：状态仍是 pending，inFlight 已释放，到点还能再探", async () => {
    const net = stubFetch();
    saveAuthSnapshot(USER);
    startProbing();
    await flush();
    expect(net.calls).toBe(1);

    // The 8s cap hits and the request is aborted
    await vi.advanceTimersByTimeAsync(8_000);
    expect(getProbeState()).toBe("pending");
    expect(readAuthSnapshot()).not.toBeNull();

    // After the 15s backoff it probes again as usual (inFlight isn't stuck from the timeout)
    await vi.advanceTimersByTimeAsync(15_000);
    expect(net.calls).toBe(2);
  });

  it("停止探测后，在途响应回来不改状态也不清快照", async () => {
    const net = stubFetch();
    saveAuthSnapshot(USER);
    const stop = startProbing();
    await flush();

    stop();
    net.last().settle(null); // The server says "no session", but this request is already stale
    await flush();

    expect(getProbeState()).toBe("pending");
    expect(readAuthSnapshot()).not.toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it("探测期间用户重新登录：旧的「没有会话」不清新快照", async () => {
    const net = stubFetch();
    saveAuthSnapshot(USER);
    startProbing();
    await flush();

    await vi.advanceTimersByTimeAsync(1_000);
    saveAuthSnapshot(USER); // A re-login happened in between and the snapshot was rewritten
    net.last().settle(null);
    await flush();

    expect(getProbeState()).toBe("pending");
    expect(readAuthSnapshot()).not.toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it("200 但 body 结构意外：算不出结论，保持 pending", async () => {
    const net = stubFetch();
    saveAuthSnapshot(USER);
    startProbing();
    await flush();

    net.last().settle("<html>请先登录</html>");
    await flush();

    expect(getProbeState()).toBe("pending");
    expect(readAuthSnapshot()).not.toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it("非 2xx 不算登出", async () => {
    const net = stubFetch();
    saveAuthSnapshot(USER);
    startProbing();
    await flush();

    net.last().settle(null, 502);
    await flush();

    expect(getProbeState()).toBe("pending");
    expect(readAuthSnapshot()).not.toBeNull();
  });

  it("服务器明确回没有会话：清快照并判定登出", async () => {
    const net = stubFetch();
    saveAuthSnapshot(USER);
    startProbing();
    await flush();

    net.last().settle(null);
    await flush();

    expect(getProbeState()).toBe("signed-out");
    expect(readAuthSnapshot()).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
