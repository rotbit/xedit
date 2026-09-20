import { Check } from "lucide-react";

/**
 * 主打卖点的深度展示：干净的编辑器、AI 内容审核、一键发布到公众号、样式为什么不丢，
 * 各用一屏讲清楚（排版主题那一屏是 Landing 里的主题墙）。配图全部是 DOM 画的，没有位图，
 * 既能随主题变色，正文也是真实文字、进得了索引。
 */

/** 一段左右分栏：左文案右示意图。reverse 时左右互换，相邻两段错开排比一顺到底耐看。 */
function Row({
  id,
  eyebrow,
  badge,
  title,
  lead,
  points,
  reverse,
  children,
}: {
  /** 锚点：导航和页脚会跳到这里 */
  id?: string;
  eyebrow: string;
  /** 标签旁的小字，比如「内测中」 */
  badge?: string;
  title: string;
  lead: string;
  points: string[];
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16"
    >
      <div className={reverse ? "lg:order-2" : undefined}>
        <p className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--brand-tint)] px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-[var(--brand)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ember)]" aria-hidden="true" />
          {eyebrow}
          {badge && (
            <span className="rounded-full bg-[var(--ember-wash)] px-1.5 py-px text-[10px] tracking-normal text-[var(--ember)]">
              {badge}
            </span>
          )}
        </p>
        <h2 className="mt-5 text-[clamp(22px,3vw,30px)] font-semibold leading-[1.35] tracking-[-0.02em]">
          {title}
        </h2>
        <p className="mt-4 text-[14.5px] leading-[1.85] text-[var(--ink-soft)]">{lead}</p>
        <ul className="mt-6 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[13.5px] leading-6 text-[var(--ink-soft)]">
              <Check size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "lg:order-1" : undefined}>{children}</div>
    </div>
  );
}

// 几张示意图共用的卡片外观，保证各段的视觉重量一致
const card = "lp-card p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]";

/** 内联流水线：Markdown → 带 style 的 HTML → 公众号后台 */
function InlinePipeline() {
  return (
    <div className={card}>
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] tracking-wider text-[var(--ink-faint)]">你写的</p>
          <pre className="xe-source rounded-lg bg-[var(--sidebar)] px-3.5 py-2.5">
            <code>
              <span className="xe-mk">## </span>为什么样式不会丢
            </code>
          </pre>
        </div>
        <div className="flex items-center gap-2 pl-1 text-[11.5px] text-[var(--ink-faint)]">
          <span className="h-3.5 w-px bg-[var(--hairline-strong)]" />
          xEdit 把主题样式逐条内联
        </div>
        <div>
          <p className="mb-1.5 text-[11px] tracking-wider text-[var(--ink-faint)]">复制出去的</p>
          <pre className="xe-source overflow-x-auto rounded-lg bg-[var(--sidebar)] px-3.5 py-2.5">
            <code>
              <span className="xe-tag">&lt;h2</span>{" "}
              <span className="xe-attr">style</span>=
              <span className="xe-str">
                &quot;font-size:20px;border-bottom:2px solid #333&quot;
              </span>
              <span className="xe-tag">&gt;</span>
              {"\n  "}为什么样式不会丢{"\n"}
              <span className="xe-tag">&lt;/h2&gt;</span>
            </code>
          </pre>
        </div>
        <div className="flex items-center gap-2 pl-1 text-[11.5px] text-[var(--ink-faint)]">
          <span className="h-3.5 w-px bg-[var(--hairline-strong)]" />
          公众号后台粘贴，样式跟着标签走
        </div>
        <div className="rounded-lg border border-[var(--hairline)] bg-white px-4 py-3">
          <p
            className="text-[17px] font-bold text-[#333]"
            style={{ borderBottom: "2px solid #333", paddingBottom: 4 }}
          >
            为什么样式不会丢
          </p>
        </div>
      </div>
    </div>
  );
}

/** 即时渲染编辑器示意：只有正文，光标所在那一行才露出 Markdown 源码 */
function EditorMock() {
  return (
    <div className="lp-card overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]">
      <div className="flex h-9 items-center gap-1.5 border-b border-[var(--hairline)] bg-[var(--sidebar)] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#fc625d]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#35cd4b]" aria-hidden="true" />
        <span className="ml-3 text-[11.5px] text-[var(--ink-faint)]">公众号排版避坑清单</span>
        <span className="ml-auto text-[11px] text-[var(--ink-faint)]">1,905 字 · 已保存</span>
      </div>
      <div className="px-7 py-6 sm:px-10">
        <p className="font-[family-name:var(--serif)] text-[22px] font-semibold leading-snug">
          公众号排版避坑清单
        </p>
        <p className="mt-4 text-[13.5px] leading-[1.95] text-[var(--ink-soft)]">
          排版的目的只有一个：<strong className="text-[var(--ink)]">让读者读得下去</strong>
          。字号、行距、留白，都为这件事服务。
        </p>
        {/* 光标所在行：露出源码标记 */}
        <p className="mt-4 rounded-md bg-[var(--brand-tint)] px-2 py-1 text-[16px] font-semibold">
          <span className="font-mono text-[13px] font-normal text-[var(--ink-faint)]">## </span>
          一、正文字号别小于 15px
          <span
            className="ml-0.5 inline-block h-[17px] w-[1.5px] translate-y-[3px] bg-[var(--brand)]"
            aria-hidden="true"
          />
        </p>
        <p className="mt-3 border-l-2 border-[var(--hairline-strong)] pl-3 text-[13px] leading-[1.9] text-[var(--ink-soft)]">
          手机上看，15–16px 最不费眼。
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13.5px] leading-[1.9] text-[var(--ink-soft)]">
          <li>行距 1.75 倍左右</li>
          <li>
            段落之间留一行，用 <code className="rounded bg-[var(--sidebar)] px-1 py-0.5 font-mono text-[12px]">---</code> 分节
          </li>
        </ul>
      </div>
    </div>
  );
}

// 写死的示意数据：两条意见分别对应两类审核，颜色与产品里的一致（表述=品牌色，合规=朱砂）
const REVIEW_CARDS = [
  {
    kind: "表述",
    tone: "brand",
    quote: "进行了一个全面的优化",
    advice: "「进行了一个……的优化」是冗余句式，直接用动词更利落。",
    fix: "全面优化了",
  },
  {
    kind: "公众号合规",
    tone: "ember",
    quote: "全网最低价，错过再等一年",
    advice: "「全网最低」属于绝对化用语，可能被判定为夸大宣传。",
    fix: "本次活动价，限时一周",
  },
] as const;

/** AI 内容审核示意：左边正文里的波浪线标注，右边一条条意见卡 */
function ReviewMock() {
  const wavy = (tone: "brand" | "ember") =>
    `underline decoration-wavy decoration-[1.5px] underline-offset-4 ${
      tone === "brand" ? "decoration-[var(--brand)]" : "decoration-[var(--ember)]"
    }`;
  return (
    <div className={card}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3.5 text-[13px] leading-[2] text-[var(--ink-soft)]">
          <p>
            这一版我们对编辑器<span className={wavy("brand")}>进行了一个全面的优化</span>
            ，长文打字明显更顺。
          </p>
          <p className="mt-2.5">
            会员现在<span className={wavy("ember")}>全网最低价，错过再等一年</span>。
          </p>
        </div>
        <ul className="space-y-2.5">
          {REVIEW_CARDS.map((c) => (
            <li key={c.kind} className="rounded-lg border border-[var(--hairline)] px-3 py-2.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10.5px] ${
                  c.tone === "brand"
                    ? "bg-[var(--brand-wash)] text-[var(--brand)]"
                    : "bg-[var(--ember-wash)] text-[var(--ember)]"
                }`}
              >
                {c.kind}
              </span>
              <p className="mt-2 text-[12px] leading-[1.75] text-[var(--ink-soft)]">{c.advice}</p>
              <p className="mt-1.5 text-[12px] leading-[1.75]">
                <span className="text-[var(--ink-faint)]">建议改为：</span>
                {c.fix}
              </p>
              <div className="mt-2 flex gap-1.5 text-[11px]">
                <span className="rounded-md bg-[var(--brand)] px-2 py-0.5 text-[var(--paper)]">
                  采纳
                </span>
                <span className="rounded-md border border-[var(--hairline)] px-2 py-0.5 text-[var(--ink-faint)]">
                  忽略
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-[11.5px] leading-5 text-[var(--ink-faint)]">
        总评：全文 2 处建议 · 表述 1 · 公众号合规 1 · 已存入审核记录
      </p>
    </div>
  );
}

const PUBLISH_STEPS = [
  { text: "标题已填入", done: true },
  { text: "正文已填入，排版样式与 4 张图片全部保留", done: true },
  { text: "封面已设置", done: true },
  { text: "草稿已就绪，等你检查后保存、发表", done: false },
];

/** 一键发送到公众号草稿箱的状态示意 */
function PublishMock() {
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[13px] font-medium">公众号排版避坑清单</p>
        <span className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[12px] font-medium text-[var(--paper)]">
          发送到公众号
        </span>
      </div>
      <ul className="mt-4 space-y-2 rounded-lg bg-[var(--sidebar)] px-3.5 py-3">
        {PUBLISH_STEPS.map((s) => (
          <li key={s.text} className="flex items-start gap-2.5 text-[12.5px] leading-6">
            {s.done ? (
              <Check size={14} className="mt-[5px] shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <span
                className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ember)] mx-1"
                aria-hidden="true"
              />
            )}
            <span className={s.done ? "text-[var(--ink-soft)]" : "text-[var(--ink)]"}>{s.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11.5px] leading-5 text-[var(--ink-faint)]">
        登录、扫码由你完成；xEdit 只填内容，不会替你点「群发」。
      </p>
    </div>
  );
}

/** 第一屏：编辑器。放在主题墙之前，由 Landing 单独摆位 */
export function EditorShowcase() {
  return (
    <Row
      id="editor"
      eyebrow="编辑器"
      title="干净精美的 Markdown 编辑器，所见即所得"
      lead="打开就是一张纸：没有挤满按钮的工具栏，也不用盯着一屏符号。标题、加粗、列表、代码、图片和公式在编辑区里即时渲染成排版后的样子，光标移到哪一行，哪一行才露出 Markdown 源码——像 Obsidian、Typora 那样写，写出来的却是公众号成稿。"
      points={[
        "即时渲染与「左源码、右公众号预览」分栏两种模式，随时切换",
        "截图粘贴、文件拖入自动上传图床，就地插入链接",
        "成对符号补全、标题折叠、脚注、行内公式，表格里回车和 Tab 都顺手",
        "亮色 / 暗色两套界面，长文打字和滚动依然流畅",
      ]}
    >
      <EditorMock />
    </Row>
  );
}

/** 主题墙之后的三屏：AI 审核 → 一键发布 → 样式为什么不丢。顺序就是写完稿子之后的顺序，调了会打乱叙述。 */
export function Showcase() {
  return (
    <div className="space-y-20 sm:space-y-28">
      <Row
        id="ai-review"
        eyebrow="AI 内容审核"
        badge="内测中"
        title="发布之前，让 AI 把文章审一遍"
        lead="写完点「审核」，AI 通读全文，把问题直接标在对应的句子上：「表述审核」挑病句、啰嗦和逻辑跳跃，「公众号合规审核」对照平台规则，标出夸大宣传、诱导分享这类可能违规或被限流的说法。两类可以一起跑，合成一份结果。"
        points={[
          "意见标在原文句子上，右侧一栏意见卡，对照着改",
          "每条都带修改建议：一键采纳、忽略，⌘Z 可撤销",
          "「总评」给出全文层面的判断与改进方向",
          "每次审核自动存档，关掉也不丢，随时翻回来看",
        ]}
        reverse
      >
        <ReviewMock />
      </Row>

      <Row
        id="publish"
        eyebrow="一键发布"
        title="一键发布到微信公众号，不用再手动搬运"
        lead="网页版点「复制到公众号」，到后台粘贴就是成稿。Mac 客户端更省事：点「发送到公众号」，标题、带排版的正文和封面会自动填进公众号后台的草稿编辑页，图片导入失败会明确提醒，不会悄悄丢掉。"
        points={[
          "标题和正文原样使用你写的内容，不经 AI 改写",
          "封面可以取正文里的图，也可以单独上传",
          "登录、扫码由你完成；保存和发表由你确认，绝不代点群发",
          "也能复制到知乎，或导出 Markdown、HTML、PDF、长图、Word",
        ]}
      >
        <PublishMock />
      </Row>

      <Row
        eyebrow="样式不丢"
        title="粘进公众号就是成稿，排版样式一条不丢"
        lead="公众号编辑器会剥掉外部样式表，所以复制前 xEdit 会把主题里的每条样式解析出来、按优先级内联进对应标签的 style 属性。主题也一律不用伪元素——标题装饰、引用竖线、代码块背景全是真实元素，粘过去一个不少。"
        points={[
          "复制到公众号、复制到知乎，两种目标格式分别优化",
          "数学公式先渲染成 SVG，绕开公众号不支持 MathML 的老问题",
          "代码块保留高亮配色，可选 Mac 窗口样式的三个圆点",
        ]}
        reverse
      >
        <InlinePipeline />
      </Row>
    </div>
  );
}
