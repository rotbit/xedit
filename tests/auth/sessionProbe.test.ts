import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthSnapshot, readAuthSnapshot, saveAuthSnapshot } from "@/lib/authSnapshot";
import { __resetProbeForTests, getProbeState, startProbing } from "@/lib/sessionProbe";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/Toast", () => ({ toast }));
vi.mock("next-auth/react", () => ({ getSession: vi.fn(async () => null) }));

const USER = { id: "u-a", email: "a@example.com" };

/** 探测发出的那趟请求：手里攥着 resolve/reject，想什么时候回就什么时候回 */
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

/** 把挂起的微任务跑完（fake timers 下 await 一次不够） */
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

    // 8s 上限到点，请求被掐断
    await vi.advanceTimersByTimeAsync(8_000);
    expect(getProbeState()).toBe("pending");
    expect(readAuthSnapshot()).not.toBeNull();

    // 退避 15s 后照常再探一次（inFlight 没被超时卡死）
    await vi.advanceTimersByTimeAsync(15_000);
    expect(net.calls).toBe(2);
  });

  it("停止探测后，在途响应回来不改状态也不清快照", async () => {
    const net = stubFetch();
    saveAuthSnapshot(USER);
    const stop = startProbing();
    await flush();

    stop();
    net.last().settle(null); // 服务器回「没有会话」，但这趟已经作废了
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
    saveAuthSnapshot(USER); // 这中间重新登录了一次，快照被重写
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
