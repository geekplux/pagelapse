import type { BlockOp } from '../../core/types.ts';

/** An unchanged block op. */
export type EqualOp = Extract<BlockOp, { type: 'equal' }>;
/** A diff row: one block op, or a run of unchanged blocks shown collapsed. */
export type Row = { op: BlockOp } | { gap: EqualOp[] };

/** Unchanged runs at least this long collapse behind a "Show N unchanged blocks" button. */
export const MIN_GAP = 3;

/**
 * Groups `ops` into rows: each run of `equal` ops collapses into one gap row when at least `min`
 * blocks remain after keeping `context` blocks next to each neighbouring change; every other op is its own row.
 */
export function collapseUnchanged(ops: readonly BlockOp[], min = MIN_GAP, context = 1): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < ops.length; ) {
    let j = i;
    while (ops[j]?.type === 'equal') j++;
    if (j === i) {
      rows.push({ op: ops[i++]! });
      continue;
    }
    const [lo, hi] = [i > 0 ? i + context : i, j < ops.length ? j - context : j];
    const gap = hi - lo >= min;
    for (let k = i; k < j; k++) {
      if (gap && k === lo) rows.push({ gap: ops.slice(lo, hi) as EqualOp[] });
      if (!gap || k < lo || k >= hi) rows.push({ op: ops[k]! });
    }
    i = j;
  }
  return rows;
}

/** Button text for a collapsed run: "Show 12 unchanged blocks". */
export function unchangedLabel(n: number): string {
  return `Show ${n} unchanged block${n === 1 ? '' : 's'}`;
}

/** Changed blocks shown before "Show n more changes" (target/V3Work.html). */
export const FIRST_CHANGES = 8;

const changed = (r: Row) => 'op' in r && r.op.type !== 'equal';

/**
 * Where the first view of a long diff ends: after its `n`th changed block and the unchanged block that follows it, if
 * one does. Returns `rows.length` when the diff has at most `n` changes; `more` is how many changes are left.
 */
export function firstChanges(rows: readonly Row[], n = FIRST_CHANGES): { cut: number; more: number } {
  const total = rows.filter(changed).length;
  if (total <= n) return { cut: rows.length, more: 0 };
  let seen = 0;
  let cut = rows.findIndex((r) => changed(r) && ++seen === n) + 1;
  const next = rows[cut];
  if (next && 'op' in next && next.op.type === 'equal') cut++;
  return { cut, more: total - n };
}
