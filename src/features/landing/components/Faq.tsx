import { ChevronDown } from "lucide-react";
import { FAQ } from "../data";

/**
 * 常见问题用 details/summary：无 JS 也能展开，答案始终留在 HTML 里，
 * 搜索引擎读得到（同一份内容还会输出成 FAQPage 结构化数据）。
 */
export function Faq() {
  return (
    <div className="mt-10 grid gap-2.5 lg:grid-cols-2 lg:items-start">
      {FAQ.map((item) => (
        <details key={item.q} className="lp-card group px-5 open:border-[var(--hairline-strong)]">
          <summary className="flex cursor-pointer list-none items-start gap-4 py-4.5 text-[14.5px] font-medium leading-[1.65] transition-colors hover:text-[var(--brand)]">
            <span className="flex-1">{item.q}</span>
            <ChevronDown
              size={18}
              className="mt-0.5 shrink-0 text-[var(--ink-faint)] transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="border-t border-[var(--hairline)] py-4 text-[13.5px] leading-[1.9] text-[var(--ink-soft)]">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
