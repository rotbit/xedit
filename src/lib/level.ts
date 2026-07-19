/**
 * 墨灵养成体系：累计字数（扣除怠惰流失后的墨力）驱动进化。
 */

export interface WritingLevel {
  lv: number;
  name: string;
  /** 达到该等级所需累计字数 */
  minChars: number;
  mascot: string;
  motto: string;
}

export const LEVELS: WritingLevel[] = [
  {
    lv: 1,
    name: "墨点",
    minChars: 0,
    mascot: "/mascot/stage-1.png",
    motto: "一滴墨，落在纸上",
  },
  {
    lv: 2,
    name: "墨芽",
    minChars: 5_000,
    mascot: "/mascot/stage-2.png",
    motto: "字里行间，冒出新芽",
  },
  {
    lv: 3,
    name: "笔童",
    minChars: 20_000,
    mascot: "/mascot/stage-3.png",
    motto: "握住笔，就不想放下",
  },
  {
    lv: 4,
    name: "书生",
    minChars: 60_000,
    mascot: "/mascot/stage-4.png",
    motto: "伏案疾书，自有章法",
  },
  {
    lv: 5,
    name: "翰墨",
    minChars: 150_000,
    mascot: "/mascot/stage-5.png",
    motto: "落笔从容，气象渐成",
  },
  {
    lv: 6,
    name: "文豪",
    minChars: 400_000,
    mascot: "/mascot/stage-6.png",
    motto: "笔落惊风雨",
  },
];

/** 怠惰衰减：连续 3 天不写免罚，此后每天流失 300 字墨力；动笔即止 */
export const DECAY_GRACE_DAYS = 3;
export const DECAY_PER_DAY = 300;

/** 依据距上次动笔的天数计算墨力流失（只罚当前空窗，不罚历史） */
export function computeDecay(daysSinceActive: number | null): number {
  if (daysSinceActive === null) return 0;
  return Math.max(0, daysSinceActive - DECAY_GRACE_DAYS) * DECAY_PER_DAY;
}

export function getLevel(totalChars: number): WritingLevel {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (totalChars >= l.minChars) cur = l;
  return cur;
}

export function getNextLevel(totalChars: number): WritingLevel | null {
  const cur = getLevel(totalChars);
  return LEVELS.find((l) => l.lv === cur.lv + 1) ?? null;
}
