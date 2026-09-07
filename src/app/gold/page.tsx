import type { Metadata } from "next";
import { GoldCalculator } from "./GoldCalculator";

export const metadata: Metadata = {
  title: "黄金换算器",
  description: "易方达黄金基金净值与单克金价互相换算",
  // 内部小工具，不进搜索索引
  robots: { index: false, follow: false },
};

export default function GoldPage() {
  return <GoldCalculator />;
}
