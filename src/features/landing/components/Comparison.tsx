import { COMPARISON_COLUMNS, COMPARISON_NOTE, COMPARISON_ROWS } from "../data";

/**
 * 和 doocs/md、mdnice、135 的对照表。单元格是纯文本，方便 FAQ 之外
 * 再被搜索引擎当成一张表读走。
 */
export function Comparison() {
  return (
    <div className="mt-10">
      <div className="overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--panel)]">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px] leading-6">
          <caption className="sr-only">xEdit 与 doocs/md、mdnice、135 编辑器的功能对照</caption>
          <thead>
            <tr className="border-b border-[var(--hairline)] text-[12px] text-[var(--ink-faint)]">
              <th scope="col" className="sticky left-0 bg-[var(--panel)] px-4 py-3 font-medium sm:px-5">
                对照项
              </th>
              {COMPARISON_COLUMNS.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className={`px-4 py-3 font-medium sm:px-5 ${
                    col.highlight ? "bg-[var(--brand-wash)] text-[var(--ink)]" : ""
                  }`}
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row) => (
              <tr key={row.feature} className="border-t border-[var(--hairline)]">
                <th
                  scope="row"
                  className="sticky left-0 bg-[var(--panel)] px-4 py-3 font-medium text-[var(--ink)] sm:px-5"
                >
                  {row.feature}
                </th>
                {COMPARISON_COLUMNS.map((col) => (
                  <td
                    key={col.id}
                    className={`px-4 py-3 text-[var(--ink-soft)] sm:px-5 ${
                      col.highlight ? "bg-[var(--brand-wash)] font-medium text-[var(--ink)]" : ""
                    }`}
                  >
                    {row.cells[col.id]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3.5 text-[12.5px] leading-6 text-[var(--ink-faint)]">{COMPARISON_NOTE}</p>
    </div>
  );
}
