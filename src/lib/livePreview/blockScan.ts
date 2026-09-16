import { syntaxTree } from "@codemirror/language";
import type { EditorState, Transaction } from "@codemirror/state";
import { parseFrontmatter } from "@/lib/frontmatter";
import { inCodeRanges, type CodeRange } from "@/lib/livePreview/context";

/**
 * 块级即时渲染的区间扫描（表格、$$ 公式、文首 frontmatter）。
 *
 * 从 blocks.ts 里抽出来是因为它有自己的一套状态：整篇的表格/围栏区间跨事务缓存，
 * 每次按键只重扫改动覆盖的那几行——全文 `syntaxTree().iterate()` 落在按键路径上
 * 是打字卡顿的直接来源（一篇长文有上千个块级节点）。
 *
 * 增量的边界条件集中在 rescanBlocks 的注释里：能就地拼接的走增量，
 * 可能牵动远处结构的（围栏字符增删、大段改动、后台解析补完语法树）一律退回全扫。
 */

export interface BlockRange extends CodeRange {
  kind: "table" | "math" | "frontmatter";
  /** 表格与 frontmatter 用原文、公式用 TeX，作为部件的 eq 依据 */
  payload: string;
}

export interface BlockScan {
  /** 语法树扫出的表格区间（全文），与 codeRanges 一起作为增量重扫的缓存 */
  tables: BlockRange[];
  /** 围栏代码块区间：公式分隔符配对要靠它排除代码块里的 $$ */
  codeRanges: CodeRange[];
  frontmatter: BlockRange | null;
  /** 原文中独占行的 $$ 偏移；普通输入只更新改动涉及的行。 */
  mathDelimiters: number[];
  /** 三类块合并排序后的最终列表，装饰构建直接消费 */
  ranges: BlockRange[];
}

/** frontmatter 只可能在文首这几行；设个上限，免得把「文档以 --- 开头、很久以后又有一条 ---」
 *  的正文整段吞进卡片 */
const FRONTMATTER_MAX_LINES = 40;

/** 插入/删除超过这个字符数就全扫：粘贴、整段删除本来就要重排大半篇，
 *  拼接缓存既不便宜也更容易出错 */
const FULL_RESCAN_LENGTH = 1000;

/**
 * 会牵动远处结构的字符，出现在改动里就退回全扫：
 * - ` 与 ~：一对围栏的增删会把后文整段吞进/放出代码块
 * - <：HTML 块从开标签一直吃到空行，同样能把下面几行的表格吞掉
 * 这些字符在正文里都不常打，普通打字仍走增量。
 */
const RISKY_CHARS = /[`~<]/;

/**
 * 文首 frontmatter 的区间。走文本扫描而不是语法树：Setext 标题已被关掉，
 * `---` 在语法树里就是两条各自独立的 HorizontalRule，认不出成对关系。
 * 至少要解析出一个键才算数——否则一篇以分割线开头的文章会被误判成 frontmatter。
 */
function scanFrontmatter(state: EditorState): BlockRange | null {
  if (state.doc.line(1).text.trimEnd() !== "---") return null;
  const last = Math.min(state.doc.lines, FRONTMATTER_MAX_LINES);
  for (let n = 2; n <= last; n++) {
    const line = state.doc.line(n);
    if (line.text.trimEnd() !== "---") continue;
    const source = state.sliceDoc(0, line.to);
    const parsed = parseFrontmatter(source);
    if (!parsed || Object.keys(parsed.data).length === 0) return null;
    return { kind: "frontmatter", from: 0, to: line.to, payload: source };
  }
  return null;
}

/** 首次装载全文建立索引；后续只扫描事务覆盖的行，避免每个按键遍历所有正文行。 */
function collectMathDelimiters(state: EditorState, from = 0, to = state.doc.length): number[] {
  const positions: number[] = [];
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to).number;
  let pos = first.from;
  for (const text of state.doc.iterLines(first.number, last + 1)) {
    if (text.trim() === "$$") positions.push(pos);
    pos += text.length + 1;
  }
  return positions;
}

function updateMathDelimiters(previous: number[], tr: Transaction): number[] {
  if (!tr.docChanged) return previous;
  const changed: CodeRange[] = [];
  const added = new Set<number>();
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    changed.push({ from: tr.startState.doc.lineAt(fromA).from, to: tr.startState.doc.lineAt(toA).to });
    for (const pos of collectMathDelimiters(tr.state, fromB, toB)) added.add(pos);
  });
  for (const pos of previous) {
    if (!changed.some((range) => pos >= range.from && pos <= range.to)) {
      added.add(tr.changes.mapPos(pos, 1));
    }
  }
  return [...added].sort((a, b) => a - b);
}

/** 将分隔行配对成公式块；代码块内部或跨越代码块的分隔符不配对。 */
function scanMathBlocks(state: EditorState, codeRanges: CodeRange[], mathDelimiters: number[]): BlockRange[] {
  const out: BlockRange[] = [];
  const doc = state.doc;
  let openFrom = -1;
  for (const from of mathDelimiters) {
    if (inCodeRanges(codeRanges, from)) {
      openFrom = -1;
      continue;
    }
    if (openFrom >= 0 && codeRanges.some((range) => range.from > openFrom && range.from < from)) openFrom = -1;
    if (openFrom < 0) {
      openFrom = from;
      continue;
    }
    const to = doc.lineAt(from).to;
    // 首尾两行是定界符，中间才是 TeX
    const tex = doc.sliceString(openFrom, to).split("\n").slice(1, -1).join("\n").trim();
    if (tex) out.push({ kind: "math", from: openFrom, to, payload: tex });
    openFrom = -1;
  }
  return out;
}

/** 在 [from, to] 上遍历语法树收集表格与围栏区间。与区间相交的节点会被完整给出
 *  （iterate 的语义），所以局部重扫拿到的仍是整块的起止，不会截半个表格。 */
function scanTree(state: EditorState, from: number, to: number) {
  const codeRanges: CodeRange[] = [];
  const tables: BlockRange[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name === "FencedCode") {
        codeRanges.push({ from: node.from, to: node.to });
        return false;
      }
      if (node.name === "Table") {
        tables.push({
          kind: "table",
          from: node.from,
          to: node.to,
          payload: state.sliceDoc(node.from, node.to),
        });
        return false;
      }
      // 行内格式不可能包含块级表格/围栏，不必逐个访问其中的强调、链接等节点。
      if (node.name === "Paragraph" || /^ATXHeading/.test(node.name)) return false;
      return undefined;
    },
  });
  return { tables, codeRanges };
}

function mergeRanges(frontmatter: BlockRange | null, tables: BlockRange[], math: BlockRange[]): BlockRange[] {
  return [...(frontmatter ? [frontmatter] : []), ...tables, ...math].sort((a, b) => a.from - b.from);
}

/** 全文重扫。mathDelimiters 可传入现成的索引（语法树补完时分隔行并没变，不必再遍历全文行）。 */
export function scanAll(state: EditorState, mathDelimiters = collectMathDelimiters(state)): BlockScan {
  const { tables, codeRanges } = scanTree(state, 0, state.doc.length);
  const frontmatter = scanFrontmatter(state);
  return {
    tables,
    codeRanges,
    frontmatter,
    mathDelimiters,
    ranges: mergeRanges(frontmatter, tables, scanMathBlocks(state, codeRanges, mathDelimiters)),
  };
}

/**
 * 需要重扫的区间：改动一律扩到整行，再各向外扩一行。
 * 向外扩是必须的——块级结构在行边界处重组：表格尾行下面新敲一行 `| a | b |` 会把表格长大一行，
 * 只看改动那一行的话，缓存里的旧表格区间（不与改动相交）会被留下来，新表格反而被当成重叠丢掉。
 */
function changedSpan(tr: Transaction): CodeRange | null {
  const doc = tr.state.doc;
  let from = Number.POSITIVE_INFINITY;
  let to = -1;
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    from = Math.min(from, fromB);
    to = Math.max(to, toB);
  });
  if (to < 0) return null;
  const firstLine = doc.lineAt(from).number;
  const lastLine = doc.lineAt(to).number;
  return {
    from: doc.line(Math.max(1, firstLine - 1)).from,
    to: doc.line(Math.min(doc.lines, lastLine + 1)).to,
  };
}

/** 改动是否可能牵动重扫区间以外的结构（围栏/HTML 字符增删、大段改动）——那就别增量了 */
function needsFullRescan(tr: Transaction): boolean {
  let risky = false;
  let total = 0;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (risky) return;
    total += toA - fromA + inserted.length;
    if (total > FULL_RESCAN_LENGTH) {
      risky = true;
      return;
    }
    // 插入与删除的文字都要看：删掉一条 ``` 同样会让后文整段改变归属
    risky =
      RISKY_CHARS.test(inserted.toString()) ||
      RISKY_CHARS.test(tr.startState.doc.sliceString(fromA, toA));
  });
  return risky;
}

/**
 * 把缓存区间平移到新坐标并与重扫结果合并。
 * 两种情况下缓存那份要让位给新结果：与重扫区间相交（重扫已按新语法树给出完整区间），
 * 或与某个新区间重叠（同一个块被两边各给出一份，留下旧的会导致装饰重叠）。
 */
function mergeCached<T extends CodeRange>(cached: T[], fresh: T[], tr: Transaction, span: CodeRange): T[] {
  const out = [...fresh];
  for (const range of cached) {
    const from = tr.changes.mapPos(range.from, 1);
    const to = tr.changes.mapPos(range.to, -1);
    if (to >= span.from && from <= span.to) continue;
    if (fresh.some((f) => f.to >= from && f.from <= to)) continue;
    out.push({ ...range, from, to });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** 事务后的块区间。能增量就只重扫改动附近，其余情况退回全扫。 */
export function rescanBlocks(previous: BlockScan, tr: Transaction): BlockScan {
  // 只有语法树变了（后台增量解析补完了后半篇，见 @codemirror/language 的 parseWorker）：
  // 新旧树的差异区间无从得知，只能全扫。好在这类事务发生在空闲时段，不在按键路径上。
  if (!tr.docChanged) return scanAll(tr.state, previous.mathDelimiters);

  const mathDelimiters = updateMathDelimiters(previous.mathDelimiters, tr);
  const span = needsFullRescan(tr) ? null : changedSpan(tr);
  if (!span) return scanAll(tr.state, mathDelimiters);

  const fresh = scanTree(tr.state, span.from, span.to);
  const tables = mergeCached(previous.tables, fresh.tables, tr, span);
  const codeRanges = mergeCached(previous.codeRanges, fresh.codeRanges, tr, span);
  // frontmatter 只可能落在文首 FRONTMATTER_MAX_LINES 行内：改动起点在这之后就影响不到它，
  // 区间位置也在改动之前、无需平移，整份缓存原样留着（省掉一次 YAML 解析）
  const head = tr.state.doc.line(Math.min(tr.state.doc.lines, FRONTMATTER_MAX_LINES)).to;
  const frontmatter = span.from <= head ? scanFrontmatter(tr.state) : previous.frontmatter;

  return {
    tables,
    codeRanges,
    frontmatter,
    mathDelimiters,
    ranges: mergeRanges(frontmatter, tables, scanMathBlocks(tr.state, codeRanges, mathDelimiters)),
  };
}
