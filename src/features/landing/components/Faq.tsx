import { ChevronDown } from "lucide-react";
import { FAQ } from "../data";

/**
 * 常见问题用 details/summary：无 JS 也能展开，答案始终留在 HTML 里，
 * 搜索引擎读得到（同一份内容还会输出成 FAQPage 结构化数据）。
 */
export function Faq() {
  return (
    <div className="mt-10 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
      {FAQ.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex cursor-pointer list-none items-start gap-4 py-5 text-[15px] font-medium leading-[1.6] transition-colors hover:text-[var(--seal)]">
            <span className="flex-1">{item.q}</span>
            <ChevronDown
              size={17}
              className="mt-0.5 shrink-0 text-[var(--ink-faint)] transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="pb-5 pr-9 text-[14px] leading-[1.9] text-[var(--ink-soft)]">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
