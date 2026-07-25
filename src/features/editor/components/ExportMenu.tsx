"use client";

import { Download } from "lucide-react";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import { runExport, type ExportKind } from "../lib/exportDoc";
import { ghostBtn } from "../lib/styles";

const ITEMS: { kind: ExportKind; label: string }[] = [
  { kind: "md", label: "导出 Markdown" },
  { kind: "html", label: "导出 HTML" },
  { kind: "pdf", label: "导出 PDF（打印）" },
  { kind: "image", label: "导出长图（PNG）" },
];

export function ExportMenu() {
  return (
    <Dropdown
      width={180}
      trigger={
        <button className={`${ghostBtn} hidden md:flex`} title="导出">
          <Download size={15} />
        </button>
      }
    >
      {ITEMS.map(({ kind, label }) => (
        <button key={kind} className={menuItemCls} onClick={() => void runExport(kind)}>
          {label}
        </button>
      ))}
    </Dropdown>
  );
}
