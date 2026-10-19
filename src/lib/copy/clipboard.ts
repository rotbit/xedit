/**
 * Writes to the clipboard in both rich text (text/html) and plain text formats.
 * Prefers selection + execCommand copy: this path skips the async Clipboard API's
 * HTML sanitizing (which may drop styles like data: URI background images), so it pastes best into WeChat.
 */
import { t } from "@/i18n/t";

export async function copyRichHtml(html: string, plainText: string): Promise<void> {
  if (copyViaSelection(html)) return;

  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainText], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return;
  }
  throw new Error(t("当前浏览器不支持复制"));
}

function copyViaSelection(html: string): boolean {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  // When copying, the browser stamps the effective background from the container chain onto every block element:
  // it must be pinned to pure white, or the app's own paper gray would follow into WeChat (pure white still inverts correctly in WeChat dark mode)
  container.style.backgroundColor = "#ffffff";
  container.setAttribute("contenteditable", "true");
  // html comes from buildWechatHtml/buildZhihuHtml and was already sanitized by DOMPurify at the source
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    const ok = document.execCommand("copy");
    selection.removeAllRanges();
    return ok;
  } catch {
    return false;
  } finally {
    container.remove();
  }
}

export async function copyPlainText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
