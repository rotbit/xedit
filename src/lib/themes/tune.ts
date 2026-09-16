// 排版微调的默认值。单独成文件（不塞进 themes/index）是因为 store 也要用它：
// index 会把 presets/base 那几十 KB 的 CSS 字面量一并拖进模块图，而 store 几乎人人 import。

/** 排版微调：正文字号(px)/行高/段间距(px) */
export interface TuneValues {
  tuneFontSize: number;
  tuneLineHeight: number;
  tuneParaSpacing: number;
}

/** 默认排版：store 初值、「重置排版微调」按钮、以及 buildTuneCss 判断「等于默认就不出规则」
 *  三处共用同一份。以前是各写一遍字面量，改一个数就会有地方漏改 */
export const DEFAULT_TUNE: TuneValues = {
  tuneFontSize: 16,
  tuneLineHeight: 1.75,
  tuneParaSpacing: 16,
};
