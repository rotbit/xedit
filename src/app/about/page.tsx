import type { Metadata } from "next";
import { Landing } from "@/features/landing/Landing";

/**
 * 落地页的固定入口。`/` 一身二任——有工作区后就永远是工作台，
 * 老用户想再看产品介绍只能从这里进。内容与首页未登录态完全相同，
 * 所以不收录、canonical 指回 `/`，避免搜索引擎判定重复页。
 */
export const metadata: Metadata = {
  title: "产品介绍",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default function AboutPage() {
  return <Landing />;
}
