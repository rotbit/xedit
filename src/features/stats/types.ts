/** /api/stats 的返回结构：写作足迹页的唯一数据源 */
export interface Stats {
  totalDocs: number;
  totalChars: number;
  effectiveChars?: number;
  decay?: number;
  daysSinceActive?: number | null;
  monthChars: number;
  streak: number;
  avgChars: number;
  longest: { title: string; chars: number } | null;
  categories: { name: string; count: number }[];
  heatmap: { date: string; chars: number; active: boolean }[];
  peakHour: number | null;
}

/** 热力图 / 趋势图共用的日粒度数据 */
export type HeatmapData = Stats["heatmap"];
