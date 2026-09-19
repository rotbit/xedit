import { useStore } from "@/store/useStore";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { toast } from "@/components/Toast";
import { buildRenderOptions } from "./renderOptions";

/**
 * 「发送到公众号草稿」：把标题和按当前主题排好的 HTML 交给本机的草稿服务
 * （xedit-desktop/wechat-draft-service，只监听 127.0.0.1），由它驱动 Chrome 填进公众号后台并存成草稿。
 * 网页这边只交内容、轮询状态；不碰公众号登录态，也拿不到服务那边的 API Key。
 * 发表永远由用户自己在公众号后台点。
 */
const SERVICE = "http://127.0.0.1:17831";
const POLL_MS = 1000;
const NOT_RUNNING = "没连上本机草稿服务。请先在 xedit-desktop 目录运行 npm run wechat-draft";

type JobState = "running" | "done" | "failed" | "uncertain";
interface JobView {
  jobId: string;
  state: JobState;
  message: string;
  warnings: string[];
}
interface DraftReply extends Partial<JobView> {
  error?: string;
  message?: string;
}

async function post(body: unknown): Promise<{ status: number; data: DraftReply }> {
  const res = await fetch(`${SERVICE}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as DraftReply };
}

/** 桌面壳自己在顶栏里显示进度胶囊（xedit-desktop/tabs.js），这时网页就不再一条条弹提示 */
const shellShowsProgress = (): boolean =>
  (window as unknown as { xeditDesktop?: { draftProgress?: boolean } }).xeditDesktop?.draftProgress === true;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** onStatus 收到的是进行中的一句话状态；结束（无论成败）时收到 null */
export async function sendWechatDraft(onStatus: (message: string | null) => void): Promise<void> {
  try {
    const s = useStore.getState();
    const title = s.title.trim();
    if (!title) {
      toast("请先给文章起个标题", "error");
      return;
    }
    onStatus("正在生成公众号排版…");
    const html = await buildWechatHtml(s.content, await buildRenderOptions());
    const payload = { title, html };

    let reply: { status: number; data: DraftReply };
    try {
      reply = await post(payload);
      // 同一篇已经存过（或上次结果不确定）：再发会多出一篇草稿，必须用户自己点头
      if (reply.status === 409 && reply.data.error === "duplicate") {
        if (!window.confirm(`${reply.data.message ?? "这篇内容可能已有草稿。"}\n\n仍要再发送一次吗？`)) return;
        reply = await post({ ...payload, force: true });
      }
    } catch {
      toast(NOT_RUNNING, "error");
      return;
    }
    if (reply.status !== 202 || !reply.data.jobId) {
      toast(reply.data.message ?? `草稿服务拒绝了请求（${reply.status}）`, "error");
      return;
    }

    const jobId = reply.data.jobId;
    let shown = "";
    let misses = 0;
    for (;;) {
      await sleep(POLL_MS);
      let job: JobView | null;
      try {
        const res = await fetch(`${SERVICE}/status`);
        job = ((await res.json()) as { job: JobView | null }).job;
        misses = 0;
      } catch {
        // 服务中途没了：草稿可能已经建了一半，不重发，让用户去后台看
        if (++misses < 5) continue;
        toast("与本机草稿服务断开了。请到公众号草稿箱确认是否已有这篇，不要直接重发", "error");
        return;
      }
      if (!job || job.jobId !== jobId) {
        toast("草稿服务的任务状态丢失，请到公众号草稿箱确认", "error");
        return;
      }
      if (job.state === "running") {
        if (job.message !== shown) {
          shown = job.message;
          onStatus(shown);
          if (!shellShowsProgress()) toast(shown, "info");
        }
        continue;
      }
      // toast 单行截断、几秒就收，装不下失败原因和图片警告——这些必须让人看完，用弹窗
      const imageWarnings = job.warnings.filter((w) => w.includes("图片"));
      if (job.state === "done" && imageWarnings.length === 0) {
        if (!shellShowsProgress()) toast("草稿已保存并核对通过，请到公众号后台设置封面后自行发表", "success");
      } else if (job.state === "done") {
        window.alert(`草稿已保存，但图片有问题，请到公众号后台检查：\n\n${imageWarnings.join("\n")}\n\n封面也需要手动设置。`);
      } else if (job.state === "uncertain") {
        window.alert(`结果不确定：${job.message}\n\n公众号草稿箱里可能已经有这篇，请先去核对，不要直接重发。`);
      } else {
        window.alert(`没有保存草稿：${job.message}`);
      }
      return;
    }
  } catch (e) {
    toast(`发送失败：${e instanceof Error ? e.message : String(e)}`, "error");
  } finally {
    onStatus(null);
  }
}
