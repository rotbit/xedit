// 所有主题共享的结构性基础样式。
// 注意：装饰必须用真实元素（prefix/suffix span）或内联可继承属性，
// 伪元素/伪类在复制到公众号后会丢失，主题中不要依赖它们
// （:nth-child 这类结构性伪类除外——内联器用 el.matches 匹配，能落到具体元素上）。

// Mac 窗口三个圆点，data URI 形式的 SVG，公众号支持 background-image data URI
export const MAC_DOTS =
  `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='13' viewBox='0 0 45 13'%3E%3Ccircle cx='6.5' cy='6.5' r='5' fill='%23fc625d'/%3E%3Ccircle cx='22.5' cy='6.5' r='5' fill='%23fdbc40'/%3E%3Ccircle cx='38.5' cy='6.5' r='5' fill='%2335cd4b'/%3E%3C/svg%3E")`;

export const BASE_CSS = `
#nice {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  color: #333333;
  line-height: 1.75;
  letter-spacing: 0.5px;
  word-break: break-word;
  overflow-wrap: break-word;
  padding: 16px 16px 24px 16px;
  background-color: #ffffff;
}
#nice p {
  margin: 16px 0;
  text-align: justify;
}
#nice h1, #nice h2, #nice h3, #nice h4, #nice h5, #nice h6 {
  font-weight: bold;
  line-height: 1.45;
}
#nice h1 { margin: 32px 0 20px 0; }
#nice h2 { margin: 36px 0 18px 0; }
#nice h3 { margin: 28px 0 14px 0; }
#nice h4, #nice h5, #nice h6 { margin: 24px 0 12px 0; }
#nice img {
  max-width: 100%;
  display: block;
  margin: 0 auto;
  border-radius: 4px;
}
#nice video {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  border-radius: 6px;
  background-color: #000000;
}
#nice figure {
  margin: 22px 0;
}
/* 复制到公众号时视频降级出的占位块（公众号粘贴不支持 video，需后台手动插入） */
#nice .video-placeholder {
  margin: 20px 0;
}
#nice .video-placeholder img {
  border-radius: 6px;
}
#nice .video-placeholder .video-note {
  display: block;
  text-align: center;
  font-size: 13px;
  line-height: 1.6;
  color: #999999;
  background-color: #f8f8f8;
  border: 1px dashed #dddddd;
  border-radius: 6px;
  padding: 10px 14px;
  margin-top: 8px;
}
#nice figcaption {
  display: block;
  text-align: center;
  font-size: 13px;
  color: #999999;
  margin-top: 8px;
  line-height: 1.6;
}
#nice ul, #nice ol {
  margin: 14px 0;
  padding-left: 26px;
}
#nice ul {
  list-style: disc;
}
#nice ul ul {
  list-style: circle;
}
#nice ol {
  list-style: decimal;
}
#nice ul.contains-task-list {
  list-style: none;
  padding-left: 8px;
}
#nice li {
  margin: 6px 0;
  line-height: 1.75;
}
#nice hr {
  border: none;
  border-top: 1px solid #e5e5e5;
  margin: 32px 0;
}
#nice blockquote {
  margin: 20px 0;
  padding: 4px 16px;
}
#nice blockquote p {
  margin: 10px 0;
}
#nice pre.code-block {
  margin: 20px 0;
  border-radius: 8px;
  overflow: hidden;
}
#nice pre.code-block code.hljs {
  display: block;
  overflow-x: auto;
  padding: 14px 16px;
  font-size: 13.5px;
  line-height: 1.7;
  font-family: "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  letter-spacing: 0;
  border-radius: 8px;
}
#nice pre.code-block.mac-code code.hljs {
  padding-top: 34px;
  background-image: ${MAC_DOTS};
  background-repeat: no-repeat;
  background-position: 14px 12px;
  background-size: 45px 13px;
}
#nice p code, #nice li code, #nice td code, #nice blockquote code:not(.hljs) {
  font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  padding: 2px 6px;
  margin: 0 2px;
  border-radius: 4px;
  letter-spacing: 0;
}
#nice .table-container {
  overflow-x: auto;
  margin: 20px 0;
}
#nice table {
  border-collapse: collapse;
  margin: 0 auto;
  font-size: 14px;
  width: auto;
  max-width: 100%;
}
#nice th, #nice td {
  border: 1px solid #e3e3e3;
  padding: 9px 14px;
  line-height: 1.6;
  min-width: 60px;
}
#nice th {
  font-weight: 600;
}
#nice tr:nth-child(2n) td {
  background-color: #fafafa;
}
#nice .math-block {
  overflow-x: auto;
  margin: 18px 0;
  text-align: center;
}
#nice .table-of-contents {
  margin: 20px 0;
  padding: 14px 18px;
  border-radius: 8px;
  background-color: #f8f8f8;
}
#nice .table-of-contents .toc-title {
  font-weight: bold;
  margin: 0 0 8px 0;
}
#nice .table-of-contents ul {
  margin: 0;
  padding-left: 4px;
  list-style: none;
}
#nice .table-of-contents li {
  margin: 4px 0;
  font-size: 14px;
}
#nice .table-of-contents li.toc-level-2 { padding-left: 16px; }
#nice .table-of-contents li.toc-level-3 { padding-left: 32px; }
#nice .footnotes-sep {
  margin-top: 32px;
}
#nice .footnotes {
  font-size: 14px;
  color: #888888;
}
#nice .footnote-word, #nice .footnote-ref {
  color: inherit;
}
#nice sup.footnote-num {
  font-size: 12px;
  line-height: 0;
}
#nice .footnote-refs {
  margin-top: 32px;
}
#nice .footnote-refs .refs-title {
  font-size: 15px;
  font-weight: bold;
  margin: 8px 0;
}
#nice .footnote-item {
  font-size: 13px;
  color: #888888;
  margin: 6px 0;
  line-height: 1.6;
  word-break: break-all;
}
#nice input[type="checkbox"] {
  margin-right: 6px;
}
`;
