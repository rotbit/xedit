"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";
import { useStore } from "@/store/useStore";

const REVIEW_PROMPT = `你是资深的微信公众号内容合规与流量推荐（加热）审查专家，熟悉《微信公众平台运营规范》、公众号推荐/加热机制与广告法。
审查用户提供的文章，找出会影响平台推荐、加热资格或有违规风险的内容，审查维度：
1. 标题党与夸大误导（震惊体、恐吓式、悬念欺骗、与内容不符）
2. 广告法违禁词（绝对化用语：最、第一、国家级、顶级、100%、根治、稳赚等）
3. 诱导行为（诱导关注/点赞/在看/转发/集赞/加群/好评返现）
4. 医疗健康类夸大功效或未经证实的宣称
5. 财经投资类承诺收益、荐股、暗示保本高回报
6. 低俗、软色情、血腥恐怖内容
7. 时政敏感或不当表述
8. 缺乏依据的绝对化断言、疑似不实信息
9. 版权风险（大段摘录他人内容且未注明来源）
10. 隐私泄露（真实姓名、电话、住址、证件号等）
11. 错别字、明显病句与标点误用（把发现的错字逐条列出，level 用 low）

严格只输出 JSON（不要用 markdown 代码块包裹），格式如下：
{"score":整数0到100（100为完全健康、加热友好）,"summary":"一句话总评","issues":[{"level":"high|mid|low","category":"分类名","quote":"有问题的原文片段，截取不超过40字","reason":"问题说明","suggestion":"具体修改建议"}]}
没有发现问题时 issues 输出空数组，score 给 95 以上。`;

interface Issue {
  level: "high" | "mid" | "low";
  category: string;
  quote: string;
  reason: string;
  suggestion: string;
}

interface Report {
  score: number;
  summary: string;
  issues: Issue[];
}

const LEVEL_STYLE: Record<Issue["level"], { text: string; cls: string }> = {
  high: { text: "高风险", cls: "bg-red-50 text-red-700 border-red-200" },
  mid: { text: "中风险", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { text: "建议", cls: "bg-[var(--paper)] text-[var(--ink-soft)] border-[var(--hairline-strong)]" },
};

const MAX_CHARS = 30000;

function parseReport(text: string): Report {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const data = JSON.parse(cleaned) as Partial<Report>;
  if (typeof data.score !== "number" || !Array.isArray(data.issues)) {
    throw new Error("AI 返回格式异常");
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(data.score))),
    summary: typeof data.summary === "string" ? data.summary : "",
    issues: data.issues.filter(
      (i): i is Issue => Boolean(i && typeof i === "object" && "category" in i)
    ),
  };
}

async function runReview(): Promise<{ report: Report; truncated: boolean }> {
  const s = useStore.getState();
  const truncated = s.content.length > MAX_CHARS;
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: s.aiBaseUrl,
      apiKey: s.aiApiKey,
      model: s.aiModel,
      system: REVIEW_PROMPT,
      prompt: `文章标题：${s.title}\n\n${s.content.slice(0, MAX_CHARS)}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return { report: parseReport(data.text), truncated };
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

export function ReviewDialog({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    runReview()
      .then(({ report, truncated }) => {
        if (cancelled) return;
        setReport(report);
        setTruncated(truncated);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "审查失败");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [round]);

  const retry = () => {
    setLoading(true);
    setError("");
    setRound((r) => r + 1);
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-[600px] max-h-[88vh] w-[600px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span className="flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]">
            <ShieldCheck size={16} className="text-[var(--accent)]" />
            公众号内容审查
          </span>
          <div className="flex items-center gap-1">
            {!loading ? (
              <button
                className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)]"
                onClick={retry}
              >
                <RefreshCw size={13} />
                重新审查
              </button>
            ) : null}
            <button
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--ink-faint)]">
            <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
            <p className="text-[13px]">正在按公众号运营规范与加热规则逐项审查…</p>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <AlertTriangle size={22} className="text-amber-500" />
            <p className="text-[13px] text-[var(--ink-soft)]">{error}</p>
          </div>
        ) : report ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* 总评 */}
            <div className="flex items-center gap-5 border-b border-[var(--hairline)] px-6 py-5">
              <div className="text-center">
                <p className={`text-[40px] font-bold leading-none ${scoreColor(report.score)}`}>
                  {report.score}
                </p>
                <p className="mt-1 text-[11px] tracking-widest text-[var(--ink-faint)]">
                  健康分
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-6 text-[var(--ink)]">{report.summary}</p>
                <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
                  {report.issues.length === 0
                    ? "未发现影响推荐/加热的风险点"
                    : `共发现 ${report.issues.length} 处风险点，逐条核对后再发布`}
                  {truncated ? "（文章较长，仅审查前 3 万字）" : ""}
                </p>
              </div>
            </div>

            {/* 风险点列表 */}
            {report.issues.length > 0 ? (
              <div className="px-5 py-3">
                {report.issues.map((issue, i) => {
                  const style = LEVEL_STYLE[issue.level] ?? LEVEL_STYLE.low;
                  return (
                    <div
                      key={i}
                      className="mb-3 rounded-lg border border-[var(--hairline)] p-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded border px-1.5 py-px text-[10.5px] ${style.cls}`}
                        >
                          {style.text}
                        </span>
                        <span className="text-[13px] font-medium text-[var(--ink)]">
                          {issue.category}
                        </span>
                      </div>
                      {issue.quote ? (
                        <p className="mt-2 rounded bg-[var(--paper)] px-2.5 py-1.5 text-[12.5px] leading-5 text-[var(--ink-soft)]">
                          “{issue.quote}”
                        </p>
                      ) : null}
                      <p className="mt-2 text-[12.5px] leading-5 text-[var(--ink-soft)]">
                        {issue.reason}
                      </p>
                      {issue.suggestion ? (
                        <p className="mt-1.5 text-[12.5px] leading-5 text-emerald-700">
                          建议：{issue.suggestion}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-emerald-600">
                <ShieldCheck size={26} />
                <p className="text-[13px]">内容健康，可放心发布</p>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex h-10 shrink-0 items-center border-t border-[var(--hairline)] px-5">
          <p className="text-[11px] text-[var(--ink-faint)]">
            审查结果由 AI 生成，仅供参考，不构成平台官方判定
          </p>
        </div>
      </div>
    </div>
  );
}
