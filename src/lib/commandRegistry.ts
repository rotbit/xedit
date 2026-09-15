/**
 * 全站命令注册表（纯模块，无 React）。
 * 命令面板（⌘⇧P）要把散在各处的动作串成一张表，而这些动作的宿主组件（工作台、文章视图）
 * 生命周期各不相同——放 Context 就得让所有宿主都挂在同一棵子树下，还要逐层透传。
 * 改成模块级注册表：谁在场谁注册，卸载即注销，面板只管订阅结果。
 */

export interface Command {
  /** 全局唯一，也是列表的 React key */
  id: string;
  label: string;
  /** 命令所属分组，面板里显示成「分组 › 命令名」 */
  group: string;
  /** 快捷键提示（mac 符号，Windows 也显示同一套），仅展示不绑定 */
  keys?: string;
  run: () => void | Promise<void>;
  /** 当前是否可用（如「关闭当前标签」要有打开的标签）；每次取用现算，不缓存 */
  when?: () => boolean;
}

/**
 * 按注册批次存，注销时整批摘掉：同一个宿主的命令天然聚在一起，
 * 列表顺序 = 各宿主的注册先后 = 工作台命令在前、文章命令在后。
 */
const batches: Command[][] = [];
const listeners = new Set<() => void>();

/**
 * 摊平后的快照。useSyncExternalStore 要求同一状态下 getSnapshot 返回同一个引用，
 * 每次新建数组会让订阅方陷入无限重渲染，所以这里缓存住，注册表变了才重建。
 * 注意缓存的是「注册了哪些命令」，不含 when() 的结果——可用性跟界面状态走，取用方现算。
 */
let snapshot: Command[] = [];
let stale = true;

function notify() {
  stale = true;
  for (const cb of listeners) cb();
}

/** @returns 注销函数（幂等：StrictMode 下清理可能跑两次） */
export function registerCommands(cmds: Command[]): () => void {
  // 复制一份：调用方之后再改那个数组，不该影响已经注册进来的内容
  const batch = cmds.slice();
  batches.push(batch);
  notify();
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const i = batches.indexOf(batch);
    if (i !== -1) batches.splice(i, 1);
    notify();
  };
}

/** 已注册的全部命令（含 when() 为 false 的），按注册顺序；引用在注册表不变时保持稳定 */
export function commandsSnapshot(): Command[] {
  if (stale) {
    const out: Command[] = [];
    const seen = new Set<string>();
    for (const batch of batches) {
      for (const cmd of batch) {
        // 同 id 只留先注册的：重复行会撞 React key，也让人以为有两条一样的命令
        if (seen.has(cmd.id)) continue;
        seen.add(cmd.id);
        out.push(cmd);
      }
    }
    snapshot = out;
    stale = false;
  }
  return snapshot;
}

/** 命令此刻是否可用 */
export function isAvailable(cmd: Command): boolean {
  return !cmd.when || cmd.when();
}

/** 当前可用的命令，注册顺序 */
export function listCommands(): Command[] {
  return commandsSnapshot().filter(isAvailable);
}

export function subscribeCommands(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 匹配质量：rank 越小越优先，同 rank 比命中起点（越靠前越好），再比跨度（越紧凑越好） */
interface Score {
  rank: number;
  start: number;
  span: number;
}

/** 子序列匹配：q 的字符按序散落在 text 里即算命中（贪心取最早的一组） */
function subsequence(text: string, q: string): Score | null {
  let start = -1;
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] !== q[i]) continue;
    if (i === 0) start = j;
    i++;
    if (i === q.length) return { rank: 0, start, span: j - start + 1 };
  }
  return null;
}

/** label 优先于 group，子串优先于子序列；都不中返回 null */
function score(cmd: Command, q: string): Score | null {
  const label = cmd.label.toLowerCase();
  const group = cmd.group.toLowerCase();
  const inLabel = label.indexOf(q);
  if (inLabel !== -1) return { rank: 0, start: inLabel, span: q.length };
  const inGroup = group.indexOf(q);
  if (inGroup !== -1) return { rank: 1, start: inGroup, span: q.length };
  const subLabel = subsequence(label, q);
  if (subLabel) return { ...subLabel, rank: 2 };
  const subGroup = subsequence(group, q);
  if (subGroup) return { ...subGroup, rank: 3 };
  return null;
}

/**
 * 按关键词过滤并排序。空查询保持原序（注册顺序即推荐顺序）。
 * 纯字符串比对，几十条命令的量级下不必防抖、不必缓存。
 */
export function filterCommands(cmds: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return cmds;
  const scored: { cmd: Command; s: Score; i: number }[] = [];
  cmds.forEach((cmd, i) => {
    const s = score(cmd, q);
    if (s) scored.push({ cmd, s, i });
  });
  scored.sort(
    (a, b) =>
      a.s.rank - b.s.rank || a.s.start - b.s.start || a.s.span - b.s.span || a.i - b.i
  );
  return scored.map((x) => x.cmd);
}
