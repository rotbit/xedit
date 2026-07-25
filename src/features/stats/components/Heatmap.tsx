"use client";

import { cellColor, firstWeekdayOffset } from "../lib/format";
import type { HeatmapData } from "../types";

const CELL = 13;
const GAP = 3;

/** 近 12 周写作热力图：按周分列（列 = 周，行 = 周一到周日） */
export function Heatmap({ data }: { data: HeatmapData }) {
  const firstOffset = firstWeekdayOffset(data[0].date);
  const weeks = Math.ceil((firstOffset + data.length) / 7);

  const monthLabels: { x: number; text: string }[] = [];
  let lastMonth = "";
  let lastCol = -3;
  data.forEach((d, i) => {
    const month = d.date.slice(5, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      const col = Math.floor((firstOffset + i) / 7);
      if (col - lastCol >= 2) {
        monthLabels.push({ x: col * (CELL + GAP), text: `${Number(month)}月` });
        lastCol = col;
      }
    }
  });

  return (
    <svg
      width={weeks * (CELL + GAP)}
      height={7 * (CELL + GAP) + 16}
      className="shrink-0"
      role="img"
      aria-label="写作热力图"
    >
      {monthLabels.map((m, i) => (
        <text key={i} x={m.x} y={10} fontSize={9} fill="var(--ink-faint)">
          {m.text}
        </text>
      ))}
      {data.map((d, i) => {
        const idx = firstOffset + i;
        const col = Math.floor(idx / 7);
        const row = idx % 7;
        return (
          <rect
            key={d.date}
            x={col * (CELL + GAP)}
            y={16 + row * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx={3}
            fill={cellColor(d)}
          >
            <title>
              {d.date} · {d.active ? `${d.chars} 字` : "未写作"}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}
