import type { BlockKind, BlockOp } from '../../core/types.ts';

/** An unchanged block op. */
export type EqualOp = Extract<BlockOp, { type: 'equal' }>;
/** A diff row: one block op, or a run of unchanged blocks shown collapsed. */
export type Row = { op: BlockOp } | { gap: EqualOp[] };

/** Unchanged runs at least this long collapse behind a "Show N unchanged …" button. */
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

const NOUN: Record<BlockKind, string> = { heading: 'heading', paragraph: 'paragraph', 'list-item': 'list item', quote: 'quote', code: 'code block', 'table-row': 'table row' };

/** Button text for a collapsed run, e.g. "Show 12 unchanged paragraphs" ("blocks" when kinds mix). */
export function unchangedLabel(kinds: readonly BlockKind[]): string {
  const noun = new Set(kinds).size === 1 ? NOUN[kinds[0]!] : 'block';
  return `Show ${kinds.length} unchanged ${noun}${kinds.length === 1 ? '' : 's'}`;
}
