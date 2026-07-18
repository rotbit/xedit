/**
 * 以富文本（text/html）+ 纯文本双格式写入剪贴板。
 * 优先使用选区 + execCommand 复制：该路径不会经过异步剪贴板 API 的
 * HTML 消毒（后者可能丢弃 data: URI 背景图等样式），对公众号粘贴最友好。
 */
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
  throw new Error("当前浏览器不支持复制");
}

function copyViaSelection(html: string): boolean {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.setAttribute("contenteditable", "true");
  // html 由 buildWechatHtml/buildZhihuHtml 产出，源头已经过 DOMPurify 消毒
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
