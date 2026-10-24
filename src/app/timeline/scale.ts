// Pure geometry for the time ribbon (docs/redesign/target/V3Work.html): whole-year axis, change bars, the hairlines
// from each thumbnail down to its date, year labels, and the keyboard and pointer targets.
import { timestampToIso } from '../../core/timestamp.ts';

const DAY = 864e5;
export const YEAR = 365.25 * DAY;

export const tsToMs = (ts: string): number => Date.parse(timestampToIso(ts));

/**
 * The axis: 1 January of the first capture's year to 1 January after the last one, onto [0, width]. `ticks` are
 * every 1 January in between, both ends included.
 */
export function yearScale(times: readonly number[], width: number) {
  const y0 = new Date(Math.min(...times)).getUTCFullYear();
  const y1 = new Date(Math.max(...times)).getUTCFullYear() + 1;
  const t0 = Date.UTC(y0, 0, 1);
  const span = Date.UTC(y1, 0, 1) - t0;
  const x = (t: number) => ((t - t0) / span) * width;
  const ticks = Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ year: y0 + i, x: x(Date.UTC(y0 + i, 0, 1)) }));
  return { x, ticks };
}

/** Height of a change bar (px): 6 + sqrt(score) x 38, so the tallest is 44 and a small change still shows. */
export const barHeight = (score: number) => 6 + Math.sqrt(Math.min(1, Math.max(0, score))) * 38;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A thumbnail's hairline: down 6 px from its centre `cx`, then an S-bend to its date `x`, ending at `end` (y). */
export const hairline = (cx: number, x: number, end: number) =>
  `M${r1(cx)} 0V6C${r1(cx)} ${r1(end * 0.55)} ${r1(x)} ${r1(end * 0.45)} ${r1(x)} ${r1(end)}`;

/** A year label's anchor: the first at the left edge, the last at the right edge, the rest centred on their tick. */
export type Anchor = 'start' | 'middle' | 'end';

/**
 * Which ticks get a label, and how each is anchored: every `stride` years from the first (1, 2, 5, 10 ... the
 * smallest that keeps ticks `minGap` px apart), then any label that would come within `gap` px of the one before it
 * (labels are `w` px wide) is dropped, so labels never overlap at any width.
 */
export function yearLabels(ticks: readonly { year: number; x: number }[], width: number, w = 29, minGap = 44, gap = 8) {
  const per = ticks.length > 1 ? ticks[1]!.x - ticks[0]!.x : width;
  const stride = [1, 2, 5, 10, 20, 50].find((s) => s * per >= minGap) ?? 100;
  const out: { year: number; x: number; anchor: Anchor }[] = [];
  let right = -Infinity;
  ticks.forEach((k, i) => {
    if (i % stride) return;
    const anchor: Anchor = k.x - w / 2 < 0 ? 'start' : k.x + w / 2 > width ? 'end' : 'middle';
    const left = anchor === 'start' ? k.x : anchor === 'end' ? k.x - w : k.x - w / 2;
    if (left < right + gap) return;
    out.push({ ...k, anchor });
    right = left + w;
  });
  return out;
}

/**
 * Index of the x nearest to `x`; -1 for none. Snapping is on x only, so a horizontal drag across bars of different
 * heights always lands on the bar under the pointer's x, never on a neighbour that is nearer in 2D.
 */
export function nearestX(xs: readonly number[], x: number): number {
  let best = -1;
  let dist = Infinity;
  xs.forEach((v, i) => {
    const d = Math.abs(v - x);
    if (d < dist) {
      best = i;
      dist = d;
    }
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
