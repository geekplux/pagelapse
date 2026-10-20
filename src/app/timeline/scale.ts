// Pure geometry for the timeline strip: time -> x, year ticks and labels, marker size and stacking.
import { timestampToIso } from '../../core/timestamp.ts';

const DAY = 864e5;
export const YEAR = 365.25 * DAY;
export const R_MIN = 5;
export const R_MAX = 14;

export const tsToMs = (ts: string): number => Date.parse(timestampToIso(ts));

/** Linear scale from the padded time domain of `times` onto [x0, x1]. A one-capture domain maps to the middle. */
export function timeScale(times: readonly number[], x0: number, x1: number) {
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  const pad = Math.max((hi - lo) * 0.025, 30 * DAY);
  const t0 = lo - pad;
  const span = hi + pad - t0;
  const x = (t: number) => x0 + ((t - t0) / span) * (x1 - x0);
  return { x, t0, t1: t0 + span, pxPerYear: (YEAR / span) * (x1 - x0) };
}

/** 1 January (UTC) of every year inside [t0, t1]. */
export function yearTicks(t0: number, t1: number): { year: number; t: number }[] {
  const out = [];
  for (let y = new Date(t0).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= t1; y++) out.push({ year: y, t: Date.UTC(y, 0, 1) });
  return out;
}

/**
 * Which year ticks get a label: the smallest stride (1, 2, 5, 10 ... years) that keeps labels `minGap` px
 * apart, minus labels that would collide with the `avoid` interval (the selected date label) or the edges.
 */
export function yearLabels<T extends { year: number; x: number }>(
  ticks: readonly T[], pxPerYear: number, opts: { minGap: number; half: number; width: number; avoid?: [number, number] },
): T[] {
  const stride = [1, 2, 5, 10, 20, 50].find((s) => s * pxPerYear >= opts.minGap) ?? 100;
  const [a, b] = opts.avoid ?? [Infinity, -Infinity];
  return ticks.filter(
    (k) => k.year % stride === 0 && k.x - opts.half >= 0 && k.x + opts.half <= opts.width && (k.x + opts.half < a || k.x - opts.half > b),
  );
}

/** Marker radius in px: monotone in `score` (0..1), R_MIN..R_MAX, with area growing linearly with score. */
export function markerRadius(score: number): number {
  const s = Math.min(1, Math.max(0, score));
  return Math.sqrt(R_MIN ** 2 + (R_MAX ** 2 - R_MIN ** 2) * s);
}

/**
 * Greedy vertical stacking: each marker takes the lowest level (0..maxLevel) where it clears every earlier
 * marker on that level by `gap` px and by at least `minSep` px centre to centre (24 px pointer targets).
 */
export function stackLevels(xs: readonly number[], rs: readonly number[], maxLevel = 2, gap = 3, minSep = 24): number[] {
  const placed: { x: number; r: number; level: number }[] = [];
  return xs.map((x, i) => {
    const r = rs[i] ?? R_MIN;
    let level = 0;
    while (level < maxLevel && placed.some((p) => p.level === level && Math.abs(p.x - x) < Math.max(p.r + r + gap, minSep))) level++;
    placed.push({ x, r, level });
    return level;
  });
}

/** Index of the point nearest to (x, y), with its distance; -1 for no points. */
export function nearestPoint(points: readonly { x: number; y: number }[], x: number, y: number): { index: number; dist: number } {
  let best = { index: -1, dist: Infinity };
  points.forEach((p, index) => {
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < best.dist) best = { index, dist };
  });
  return best;
}

/** Keyboard target for the slider: Left/Right step, Home/End jump, PageUp/PageDown move about a year; null = not ours. */
export function stepIndex(key: string, i: number, times: readonly number[]): number | null {
  const last = times.length - 1;
  const clamp = (n: number) => Math.min(last, Math.max(0, n));
  const t = times[i] ?? 0;
  const byYear = (dir: 1 | -1) => {
    const target = t + dir * YEAR;
    const j = dir > 0 ? times.findIndex((x) => x >= target - 30 * DAY) : times.findLastIndex((x) => x <= target + 30 * DAY);
    return clamp(j < 0 ? (dir > 0 ? last : 0) : dir > 0 ? Math.max(j, i + 1) : Math.min(j, i - 1));
  };
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': return clamp(i + 1);
    case 'ArrowLeft': case 'ArrowDown': return clamp(i - 1);
    case 'Home': return 0;
    case 'End': return last;
    case 'PageUp': return byYear(1);
    case 'PageDown': return byYear(-1);
    default: return null;
  }
}
