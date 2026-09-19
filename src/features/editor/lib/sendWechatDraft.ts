import { useStore } from "@/store/useStore";
import { buildWechatHtml, countVideoPlaceholders } from "@/lib/copy/wechat";
import { inlineAttachments, isAttachmentSrc } from "@/lib/localBackend/attachmentUrls";
import { desktopShell } from "@/lib/desktopShell";
import { toast } from "@/components/Toast";
import { coverOf } from "../components/CoverPicker";
import { buildRenderOptions } from "./renderOptions";

/**
 * 「发送到公众号草稿」：把标题和按当前主题排好的 HTML 交给本机的草稿服务
 * （xedit-desktop/wechat-draft-service，只监听 127.0.0.1），由它驱动 Chrome 填进公众号后台（默认只填好、不保存，保存由用户自己点）。
 * 网页这边只交内容、轮询状态；不碰公众号登录态，也拿不到服务那边的 API Key。
 * 发表永远由用户自己在公众号后台点。
 * 入口只在桌面壳里露出（见 ReaderActions 的 isDesktopShell 判断）：服务由桌面 app 自己拉起，
 * 纯浏览器里点了只会弹「没连上」，还会莫名其妙冒出一个 Chrome 窗口。
 */
/** 本机草稿服务（只监听 127.0.0.1） */
const DRAFT_SERVICE = "http://127.0.0.1:17831";
const POLL_MS = 1000;
const NOT_RUNNING = "没连上本机草稿服务，请重启 xEdit 再试";

type JobState = "running" | "done" | "failed" | "uncertain";
interface JobView {
  jobId: string;
  state: JobState;
  /** "filled" = 只填好了标题/正文/封面，还没保存（服务默认如此，保存由用户自己点） */
  step?: string;
  message: string;
  warnings: string[];
}
interface DraftReply extends Partial<JobView> {
  error?: string;
  message?: string;
}

async function post(body: unknown): Promise<{ status: number; data: DraftReply }> {
  const res = await fetch(`${DRAFT_SERVICE}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as DraftReply };
}

/** 桌面壳自己在顶栏里显示进度胶囊（xedit-desktop/tabs.js），这时网页就不再一条条弹提示 */
const shellShowsProgress = (): boolean => desktopShell()?.draftProgress === true;

const decoded = (s: string): string => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};

/**
 * 封面是排好版的 HTML 里的第几张 <img>（服务那边按序号去「从正文选择」里点）。
 * 不能直接拿地址去比：本地图片在排版时被内联成了 base64，视频还会多出一张占位封面图，
 * 所以让封面地址走一遍同样的内联，再到成品 HTML 里找。找不到返回 null。
 */
async function coverIndexIn(html: string, cover: string): Promise<number | null> {
  const probe = await inlineAttachments(`![](${cover})`);
  const want = decoded(probe.slice(4, -1));
  const imgs = Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll("img"));
  const at = imgs.findIndex((img) => decoded(img.getAttribute("src") ?? "") === want);
  return at === -1 ? null : at;
}

/** 封面不在正文里（上传的 / AI 生成的）时连图一起发过去，服务那边走「上传封面」 */
type CoverImage = { dataUrl: string } | { url: string };

/**
 * 本地附件走内联拿 base64（和正文图片同一套办法），网图只给地址、由服务自己下载——
 * 浏览器这边 fetch 别人家的图会撞跨域。都拿不到就返回 null，让调用方提醒用户手动选。
 */
async function coverImageOf(cover: string): Promise<CoverImage | null> {
  if (isAttachmentSrc(cover)) {
    const src = (await inlineAttachments(`![](${cover})`)).slice(4, -1);
    return src.startsWith("data:") ? { dataUrl: src } : null;
  }
  if (cover.startsWith("data:")) return { dataUrl: cover };
  return /^https?:\/\//i.test(cover) ? { url: cover } : null;
}

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
    const cover = coverOf(s.content);
    const coverIndex = cover ? await coverIndexIn(html, cover) : null;
    // 正文里有这张图就只报序号（服务去「从正文选择」里点，最省事）；不在正文里才连图一起发
    const coverImage = cover && coverIndex === null ? await coverImageOf(cover) : null;
    const coverSent = coverIndex !== null || coverImage !== null;
    // 视频粘不进公众号，排版时已降级成占位块；这里数一下，结束时提醒人去后台补
    const videoCount = countVideoPlaceholders(html);
    const payload = {
      title,
      html,
      ...(coverIndex === null ? {} : { coverIndex }),
      ...(coverImage ? { coverImage } : {}),
    };

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
        const res = await fetch(`${DRAFT_SERVICE}/status`);
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
      // 没选封面时服务照例会提醒一句「封面未设置」，那不算问题；选了却没设上才要说
      const problems = job.warnings.filter((w) => w.includes("图片") || (coverSent && w.includes("封面")));
      if (cover && !coverSent) problems.push("封面图片读不出来，没有自动设置，请手动选择");
      const coverDone = coverSent && !problems.some((w) => w.includes("封面"));
      // 视频跟封面没关系，coverDone 算完再加，这句也刻意不含「封面」二字，免得被上面那行误判
      if (videoCount > 0) {
        problems.push(
          `文章里有 ${videoCount} 个视频没有带过去，占位块已标黄，请在公众号后台手动「插入视频」`
        );
      }
      const filled = job.step === "filled";
      const head = filled ? "已填进公众号后台，尚未保存" : "草稿已保存";
      const next = filled ? "请在公众号页检查后手动保存、发表" : "请到公众号后台检查后自行发表";
      if (job.state === "done" && problems.length === 0) {
        if (!shellShowsProgress())
          toast(`${head}${coverDone ? "，封面已设好" : ""}，${coverDone ? next : next.replace("检查", "设置封面、检查")}`, "success");
      } else if (job.state === "done") {
        window.alert(`${head}，但有几处需要你在公众号后台检查：\n\n${problems.join("\n")}${coverDone ? "" : "\n\n封面需要手动设置。"}`);
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
