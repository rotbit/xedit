/**
 * Site-wide command registry (pure module, no React).
 * The command palette (⌘⇧P) strings scattered actions into one list, but the components hosting them (workspace, article view)
 * have different lifecycles -- a Context would require all hosts under one subtree and prop drilling through every level.
 * So it's a module-level registry instead: whoever is mounted registers, unmounting unregisters, and the palette just subscribes.
 */

export interface Command {
  /** Globally unique; also the list's React key */
  id: string;
  label: string;
  /** Group the command belongs to, shown in the palette as "Group › Command" */
  group: string;
  /** Shortcut hint (mac symbols, also shown on Windows); display only, not bound */
  keys?: string;
  run: () => void | Promise<void>;
  /** Whether it's currently available (e.g. "close current tab" needs an open tab); computed on each access, not cached */
  when?: () => boolean;
}

/**
 * Stored per registration batch and removed as a whole batch on unregister: a host's commands naturally stay together,
 * and list order = hosts' registration order = workspace commands first, article commands after.
 */
const batches: Command[][] = [];
const listeners = new Set<() => void>();

/**
 * Flattened snapshot. useSyncExternalStore requires getSnapshot to return the same reference for the same state;
 * a new array each time would send subscribers into infinite re-renders, so it's cached and rebuilt only when the registry changes.
 * Note it caches "which commands are registered", not when() results -- availability follows UI state and is computed by the consumer.
 */
let snapshot: Command[] = [];
let stale = true;

function notify() {
  stale = true;
  for (const cb of listeners) cb();
}

/** @returns Unregister function (idempotent: cleanup may run twice under StrictMode) */
export function registerCommands(cmds: Command[]): () => void {
  // Copy it: later changes by the caller to that array shouldn't affect what's already registered
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

/** All registered commands (including those whose when() is false), in registration order; the reference is stable while the registry is unchanged */
export function commandsSnapshot(): Command[] {
  if (stale) {
    const out: Command[] = [];
    const seen = new Set<string>();
    for (const batch of batches) {
      for (const cmd of batch) {
        // Keep only the first registration per id: duplicate rows would collide on React key and look like two identical commands
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

/** Whether the command is available right now */
export function isAvailable(cmd: Command): boolean {
  return !cmd.when || cmd.when();
}

export function subscribeCommands(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Match quality: lower rank wins; within a rank, earlier match start wins, then tighter span wins */
interface Score {
  rank: number;
  start: number;
  span: number;
}

/** Subsequence match: hits if q's characters appear in order within text (greedily taking the earliest set) */
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

/** label beats group, substring beats subsequence; returns null if neither matches */
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
 * Filters and sorts by query. An empty query keeps the original order (registration order is the recommended order).
 * Plain string matching; with a few dozen commands there's no need for debouncing or caching.
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
