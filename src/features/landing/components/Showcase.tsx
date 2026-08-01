import { Check } from "lucide-react";

/**
 * 三段深度展示：把最容易被质疑的三件事（样式会不会丢、写崩了怎么办、
 * 能不能交给 AI）各用一屏讲清楚。配图全部是 DOM 画的，没有位图，
 * 既能随主题变色，正文也是真实文字、进得了索引。
 */

function Row({
  eyebrow,
  title,
  lead,
  points,
  reverse,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <div className={reverse ? "lg:order-2" : undefined}>
        <p className="flex items-center gap-2 text-[11.5px] font-medium tracking-[0.18em] text-[var(--seal)]">
          <span className="h-1 w-1 rounded-full bg-[var(--seal)]" />
          {eyebrow}
        </p>
        <h2 className="mt-3.5 text-[clamp(22px,3vw,29px)] font-semibold leading-[1.35] tracking-tight">
          {title}
        </h2>
        <p className="mt-4 text-[14.5px] leading-[1.85] text-[var(--ink-soft)]">{lead}</p>
        <ul className="mt-6 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[13.5px] leading-6 text-[var(--ink-soft)]">
              <Check size={15} className="mt-0.5 shrink-0 text-[var(--seal)]" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "lg:order-1" : undefined}>{children}</div>
    </div>
  );
}

const card =
  "rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]";

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

const VERSIONS = [
  { time: "今天 14:32", kind: "自动", chars: "2,418 字", current: true },
  { time: "今天 11:07", kind: "手动", chars: "2,105 字", current: false },
  { time: "昨天 21:44", kind: "自动", chars: "1,690 字", current: false },
];

/** 版本历史 + 行级 diff */
function VersionMock() {
  return (
    <div className={card}>
      <p className="text-[12px] font-medium text-[var(--ink-soft)]">版本历史</p>
      <ul className="mt-3 space-y-1">
        {VERSIONS.map((v) => (
          <li
            key={v.time}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] ${
              v.current ? "bg-[var(--accent-wash)]" : ""
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                v.current ? "bg-[var(--seal)]" : "bg-[var(--hairline-strong)]"
              }`}
            />
            <span className="text-[var(--ink)]">{v.time}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10.5px] ${
                v.kind === "手动"
                  ? "bg-[#eef4fb] text-[#1e6bb8] dark:bg-[#1c2a3a] dark:text-[#7fb3e8]"
                  : "bg-[var(--sidebar)] text-[var(--ink-faint)]"
              }`}
            >
              {v.kind}
            </span>
            <span className="ml-auto text-[11.5px] text-[var(--ink-faint)]">{v.chars}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 mb-2 text-[11px] tracking-wider text-[var(--ink-faint)]">
        与当前稿的差异
      </p>
      <div className="space-y-0.5 font-mono text-[12px] leading-[1.75]">
        <div className="rounded-[3px] px-2 text-[var(--ink-soft)]">## 为什么样式不会丢</div>
        <div className="flex rounded-[3px] bg-red-100/60 px-2 text-[var(--ink-soft)] dark:bg-red-900/25">
          <span className="w-4 shrink-0 text-red-500 dark:text-red-400">−</span>
          <span>复制之前，样式已经内联好了。</span>
        </div>
        <div className="flex rounded-[3px] bg-emerald-100/70 px-2 dark:bg-emerald-900/30">
          <span className="w-4 shrink-0 text-emerald-600 dark:text-emerald-400">+</span>
          <span>复制之前，主题样式已经逐条内联到每个标签上。</span>
        </div>
        <div className="rounded-[3px] px-2 text-[var(--ink-soft)]">&gt; 打开就写，不登录也能用。</div>
      </div>
    </div>
  );
}

const MCP_TOOLS = [
  "list_documents",
  "search_documents",
  "get_document",
  "create_document",
  "update_document",
  "delete_document",
  "list_images",
  "upload_image",
  "get_image",
];

/** MCP 接入示意 */
function McpMock() {
  return (
    <div className={card}>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <p className="text-[12px] text-[var(--ink-soft)]">
          AI 客户端已通过 OAuth 授权连接 xEdit
        </p>
      </div>
      <div className="mt-4 rounded-lg bg-[var(--sidebar)] px-3.5 py-3 text-[13px] leading-6 text-[var(--ink)]">
        「把《公众号排版指南》里的第三节改成三段式，再从图床里挑一张架构图插进去。」
      </div>
      <p className="mt-4 mb-2 text-[11px] tracking-wider text-[var(--ink-faint)]">
        可调用的工具
      </p>
      <div className="flex flex-wrap gap-1.5">
        {MCP_TOOLS.map((t) => (
          <code
            key={t}
            className="rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2 py-1 font-mono text-[11.5px] text-[var(--ink-soft)]"
          >
            {t}
          </code>
        ))}
      </div>
      <p className="mt-4 text-[11.5px] leading-5 text-[var(--ink-faint)]">
        授权走自托管的 OAuth 2.1（动态客户端注册 + PKCE），随时可在设置里撤销。
      </p>
    </div>
  );
}

export function Showcase() {
  return (
    <div className="space-y-20 sm:space-y-28">
      <Row
        eyebrow="核心能力"
        title="一键复制，粘进公众号就是成稿"
        lead="公众号编辑器会剥掉外部样式表，所以复制前 xEdit 会把主题里的每条样式解析出来、按优先级内联进对应标签的 style 属性。主题也一律不用伪元素——标题装饰、引用竖线、代码块背景全是真实元素，粘过去一个不少。"
        points={[
          "复制到公众号、复制到知乎，两种目标格式分别优化",
          "数学公式先渲染成 SVG，绕开公众号不支持 MathML 的老问题",
          "代码块保留高亮配色，可选 Mac 窗口样式的三个圆点",
          "也能导出 Markdown、HTML、PDF、长图，以及可导入飞书的 Word",
        ]}
      >
        <InlinePipeline />
      </Row>

      <Row
        eyebrow="不怕写崩"
        title="版本历史摆在那儿，随时退回去"
        lead="编辑过程中自动打快照，关键节点也可以手动存档。点开任一版本，左侧直接展示该版本全文并高亮出与当前稿的逐行差异，确认无误再回滚；回滚动作本身也会先备份现稿。"
        points={[
          "自动快照与手动存档并存，按时间线排列",
          "点击版本即预览全文，绿色是回滚会恢复的内容",
          "回滚前自动备份当前稿，反悔了还能再退回来",
          "登录后版本存在云端，换设备也在",
        ]}
        reverse
      >
        <VersionMock />
      </Row>

      <Row
        eyebrow="给 AI 用的接口"
        title="接上 MCP，让 AI 直接打理你的文章库"
        lead="xEdit 内置 MCP Server，Claude 这类支持 MCP 的客户端授权之后，可以直接列出、检索、新建、改写、删除你的文章，也能读写图床里的图片。素材整理、批量改写、按主题归档这类杂活，交给 AI 在后台做。"
        points={[
          "9 个文档与图床工具，覆盖增删改查",
          "自托管 OAuth 2.1 授权，支持动态客户端注册与 PKCE",
          "access token 按账号签发，授权可在设置里逐个撤销",
          "另有 AI 内容审查：按运营规范与广告法给文章体检",
        ]}
      >
        <McpMock />
      </Row>
    </div>
  );
}
