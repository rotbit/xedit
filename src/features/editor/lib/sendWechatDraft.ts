import { useStore } from "@/store/useStore";
import { buildWechatHtml, countVideoPlaceholders } from "@/lib/copy/wechat";
import { inlineAttachments, isAttachmentSrc } from "@/lib/localBackend/attachmentUrls";
import { desktopShell } from "@/lib/desktopShell";
import { toast } from "@/components/Toast";
import { t, tk } from "@/i18n/t";
import { coverOf } from "../components/CoverPicker";
import { buildRenderOptions } from "./renderOptions";

/**
 * 「发送到公众号草稿」 (Send to WeChat draft): hand the title and HTML laid out with the current theme to the local draft service
 * (xedit-desktop/wechat-draft-service, listening only on 127.0.0.1), which drives Chrome to fill the WeChat Official Account backend (by default it only fills, doesn't save; the user clicks save).
 * The web side only submits content and polls status; it never touches the WeChat login session and can't see the service's API key.
 * Publishing is always clicked by the user in the WeChat backend.
 * The entry only appears in the desktop shell (see the isDesktopShell check in ReaderActions): the service is launched by the desktop app,
 * and in a plain browser clicking would only show 「没连上」 (Not connected), plus a mysterious Chrome window popping up.
 */
/** Local draft service (listening only on 127.0.0.1) */
const DRAFT_SERVICE = "http://127.0.0.1:17831";
const POLL_MS = 1000;
const NOT_RUNNING = tk("没连上本机草稿服务，请重启 xEdit 再试");

type JobState = "running" | "done" | "failed" | "uncertain";
interface JobView {
  jobId: string;
  state: JobState;
  /** "filled" = title/body/cover filled in but not saved (the service's default; the user clicks save) */
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

/** The desktop shell shows its own progress pill in the top bar (xedit-desktop/tabs.js), so the web page stops showing toast after toast */
const shellShowsProgress = (): boolean => desktopShell()?.draftProgress === true;

const decoded = (s: string): string => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};

/**
 * Which <img> in the laid-out HTML is the cover (the service clicks it by index in 「从正文选择」 (Choose from body)).
 * URLs can't be compared directly: local images are inlined as base64 during layout, and videos add an extra placeholder cover image,
 * so run the cover URL through the same inlining and look for it in the final HTML. Returns null if not found.
 */
async function coverIndexIn(html: string, cover: string): Promise<number | null> {
  const probe = await inlineAttachments(`![](${cover})`);
  const want = decoded(probe.slice(4, -1));
  const imgs = Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll("img"));
  const at = imgs.findIndex((img) => decoded(img.getAttribute("src") ?? "") === want);
  return at === -1 ? null : at;
}

/** When the cover isn't in the body (uploaded / AI generated), send the image along; the service uses 「上传封面」 (Upload cover) */
type CoverImage = { dataUrl: string } | { url: string };

/**
 * Local attachments are inlined to get base64 (same approach as body images); web images just pass the URL and the service downloads them —
 * fetching other sites' images from the browser hits CORS. If neither works return null, so the caller can ask the user to pick manually.
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

/** onStatus receives a one-line in-progress status; null when finished (success or failure) */
export async function sendWechatDraft(onStatus: (message: string | null) => void): Promise<void> {
  try {
    const s = useStore.getState();
    const title = s.title.trim();
    if (!title) {
      toast(t("请先给文章起个标题"), "error");
      return;
    }
    onStatus(t("正在生成公众号排版…"));
    const html = await buildWechatHtml(s.content, await buildRenderOptions());
    const cover = coverOf(s.content);
    const coverIndex = cover ? await coverIndexIn(html, cover) : null;
    // If the image is in the body, just send its index (the service clicks it in 「从正文选择」, simplest); only send the image itself when it's not in the body
    const coverImage = cover && coverIndex === null ? await coverImageOf(cover) : null;
    const coverSent = coverIndex !== null || coverImage !== null;
    // Videos can't be pasted into WeChat and were downgraded to placeholders during layout; count them here to remind the user to add them in the backend at the end
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
      // This article was already saved (or the last result was uncertain): sending again creates another draft, so the user must confirm
      if (reply.status === 409 && reply.data.error === "duplicate") {
        // reply.data.message comes from the local draft service (in Chinese): translate on a dictionary hit, otherwise show as-is
        if (!window.confirm(`${reply.data.message ? t(reply.data.message) : t("这篇内容可能已有草稿。")}\n\n${t("仍要再发送一次吗？")}`)) return;
        reply = await post({ ...payload, force: true });
      }
    } catch {
      toast(t(NOT_RUNNING), "error");
      return;
    }
    if (reply.status !== 202 || !reply.data.jobId) {
      toast(reply.data.message ? t(reply.data.message) : t("草稿服务拒绝了请求（{status}）", { status: reply.status }), "error");
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
        // The service went away midway: the draft may be half-created, so don't resend; send the user to the backend to check
        if (++misses < 5) continue;
        toast(t("与本机草稿服务断开了。请到公众号草稿箱确认是否已有这篇，不要直接重发"), "error");
        return;
      }
      if (!job || job.jobId !== jobId) {
        toast(t("草稿服务的任务状态丢失，请到公众号草稿箱确认"), "error");
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
      // Toasts truncate to one line and vanish in seconds, too small for failure reasons and image warnings — these must be read in full, so use a dialog
      // With no cover chosen, the service routinely warns 「封面未设置」 (Cover not set), which isn't a problem; only warn if one was chosen but didn't get set
      // Warnings from the service are in the original Chinese and filtered by keyword; sentences pushed below are locally translated,
      // and coverDone only checks keywords when coverSent is true, when that sentence won't be present, so translation doesn't affect the check
      const problems = job.warnings.filter((w) => w.includes("图片") || (coverSent && w.includes("封面"))); // i18n-ignore
      if (cover && !coverSent) problems.push(t("封面图片读不出来，没有自动设置，请手动选择"));
      const coverDone = coverSent && !problems.some((w) => w.includes("封面")); // i18n-ignore
      // Video has nothing to do with the cover, so it's added after coverDone is computed, and this sentence deliberately omits 「封面」 so the line above can't misjudge it
      if (videoCount > 0) {
        problems.push(
          t("文章里有 {n} 个视频没有带过去，占位块已标黄，请在公众号后台手动「插入视频」", { n: videoCount })
        );
      }
      const filled = job.step === "filled";
      const head = filled ? t("已填进公众号后台，尚未保存") : t("草稿已保存");
      // When the cover wasn't set, the next step gets an extra 「设置封面」 (Set cover): written as separate full sentences, since English can't be assembled by swapping Chinese words
      const next = filled
        ? coverDone
          ? t("请在公众号页检查后手动保存、发表")
          : t("请在公众号页设置封面、检查后手动保存、发表")
        : coverDone
          ? t("请到公众号后台检查后自行发表")
          : t("请到公众号后台设置封面、检查后自行发表");
      if (job.state === "done" && problems.length === 0) {
        if (!shellShowsProgress())
          toast(
            coverDone ? t("{head}，封面已设好，{next}", { head, next }) : t("{head}，{next}", { head, next }),
            "success"
          );
      } else if (job.state === "done") {
        window.alert(
          `${t("{head}，但有几处需要你在公众号后台检查：", { head })}\n\n${problems.join("\n")}${coverDone ? "" : `\n\n${t("封面需要手动设置。")}`}`
        );
      } else if (job.state === "uncertain") {
        // job.message is the draft service's original Chinese, inserted as-is
        window.alert(
          `${t("结果不确定：{message}", { message: job.message })}\n\n${t("公众号草稿箱里可能已经有这篇，请先去核对，不要直接重发。")}`
        );
      } else {
        window.alert(t("没有保存草稿：{message}", { message: job.message }));
      }
      return;
    }
  } catch (e) {
    toast(t("发送失败：{error}", { error: e instanceof Error ? e.message : String(e) }), "error");
  } finally {
    onStatus(null);
  }
}
