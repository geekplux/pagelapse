import { timestampToIso } from './timestamp.ts';
import type { Capture } from './types.ts';

const ms = (ts: string) => Date.parse(timestampToIso(ts));

/**
 * Picks at most `max` captures spread over the whole time range (D8), deterministically.
 * The first and last captures are always kept. The interior range is split into `max - 2`
 * equal time buckets and each bucket keeps its capture with the largest relative size change
 * from the capture before it (a likely edit). Slots left by empty buckets go to the largest
 * remaining size changes anywhere. Returns captures in chronological order.
 */
export function sampleCaptures(captures: readonly Capture[], max: number): Capture[] {
  const all = [...captures].sort((a, b) => a.ts.localeCompare(b.ts));
  if (all.length <= max) return all;
  if (max < 2) return max < 1 ? [] : [all.at(-1)!];
  const delta = (i: number) => {
    const prev = all[i - 1]!.length;
    return Math.abs(all[i]!.length - prev) / Math.max(prev, 1);
  };
  const start = ms(all[0]!.ts);
  const span = ms(all.at(-1)!.ts) - start || 1;
  const buckets = max - 2;
  const best = new Map<number, number>();
  for (let i = 1; i < all.length - 1; i++) {
    const b = Math.min(buckets - 1, Math.floor(((ms(all[i]!.ts) - start) / span) * buckets));
    const cur = best.get(b);
    if (cur === undefined || delta(i) > delta(cur)) best.set(b, i);
  }
  const picked = new Set([0, all.length - 1, ...best.values()]);
  const rest = all.map((_, i) => i).slice(1, -1).filter((i) => !picked.has(i));
  rest.sort((a, b) => delta(b) - delta(a) || a - b);
  for (const i of rest.slice(0, max - picked.size)) picked.add(i);
  return [...picked].sort((a, b) => a - b).map((i) => all[i]!);
}
