// Structural base styles shared by all themes.
// Note: decoration must use real elements (prefix/suffix spans) or inline inheritable properties;
// pseudo-elements/pseudo-classes are lost when copied to WeChat, so themes must not rely on them
// (structural pseudo-classes like :nth-child excepted: the inliner matches with el.matches, so they resolve to concrete elements).

import { CALLOUT_TYPES } from "@/lib/callout";

/**
 * Expand Obsidian-style callout colors per type into static CSS.
 * Generated from the shared type table rather than copied by hand: editor, preview and copy share one table,
 * so adding a type or tweaking colors later touches only lib/callout.ts and the three can't drift apart.
 * Theme CSS only overrides blockquote; callouts are section.callout and won't be altered by themes.
 */
const CALLOUT_CSS = Object.entries(CALLOUT_TYPES)
  .map(
    ([type, s]) =>
      `#nice .callout-${type} { border-color: ${s.color}; background-color: ${s.background}; }\n` +
      `#nice .callout-${type} .callout-title { color: ${s.color}; }`
  )
  .join("\n");

// The three Mac window dots as a data URI SVG; WeChat supports background-image data URIs
export const MAC_DOTS =
  `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='13' viewBox='0 0 45 13'%3E%3Ccircle cx='6.5' cy='6.5' r='5' fill='%23fc625d'/%3E%3Ccircle cx='22.5' cy='6.5' r='5' fill='%23fdbc40'/%3E%3Ccircle cx='38.5' cy='6.5' r='5' fill='%2335cd4b'/%3E%3C/svg%3E")`;

// i18n-ignore typesetting CSS (including Chinese font names etc.) is data, not UI copy
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
/* Placeholder a video degrades to when copying to WeChat (pasting there drops <video>; it must be inserted manually in the backend).
   Deliberately a loud amber warning: publishing with a missing video can't be undone, so ugly beats easy to miss.
   Only inlinable properties (background/border/color/font size/padding/margin/align/radius), so it survives the paste.
   The poster and the notice share one dashed border, reading as a single "a video goes here" block. */
#nice .video-placeholder {
  margin: 20px 0;
}
#nice .video-placeholder img {
  border: 2px dashed #f0a020;
  border-radius: 6px;
}
#nice .video-placeholder .video-note {
  text-align: center;
  font-size: 15px;
  font-weight: bold;
  line-height: 1.6;
  color: #8a5300;
  background-color: #fff3cd;
  border: 2px dashed #f0a020;
  border-radius: 6px;
  padding: 14px 12px;
  margin: 0;
}
#nice .video-placeholder .video-note .video-note-hint {
  font-size: 13px;
  font-weight: normal;
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
/* Callout: the whole block is section.callout (not blockquote); copying to WeChat inlines these rules into
   style attributes, and both section and inline styles survive WeChat's editor */
#nice .callout {
  margin: 20px 0;
  padding: 12px 16px;
  border-left: 4px solid;
  border-radius: 6px;
}
#nice .callout-title {
  font-weight: 600;
  margin: 0 0 6px;
}
#nice .callout p {
  margin: 8px 0;
}
${CALLOUT_CSS}
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
  /* WeChat flags line-height < font-size as an "overlapping text" risk, so line-height: 0 can't be used to collapse the line box;
     align to the top of the line box instead: the small-font box is already shorter than the body line, so it won't stretch the line */
  line-height: 1.2;
  vertical-align: top;
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
