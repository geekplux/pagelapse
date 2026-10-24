import { formatTimestampShort } from '../../core/timestamp.ts';

// Geometry of the hero deck (docs/redesign/target/V3Hero.html, V3HeroPhone.html): one card per capture, its left
// edge at its capture date, the latest whole on the right; under the slivers a year axis with a bar per change.

const ts2ms = (ts: string) => Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12), +ts.slice(12, 14));

/** Bar height for a change score (0..1): 4 + sqrt(score) x 30 px, as drawn on the hero board (the ribbon's 6 + 38 scaled to the shorter band). */
export const barHeight = (score: number) => 4 + Math.sqrt(Math.min(1, Math.max(0, score))) * 30;

/** The axis line sits this far down its 64 px band; year labels hang below it. */
export const AXIS_Y = 40;
const AXIS_BAND = 64;
const AXIS_GAP = 8;

export interface DeckLayout {
  cardW: number;
  cardH: number;
  /** Each card sits this much lower than the one before it. */
  step: number;
  /** Width of the time scale: from the first card's left edge to the latest card's. */
  span: number;
  /** Top of the axis band, under the latest card. */
  axisTop: number;
  height: number;
  cards: { ts: string; x: number; y: number }[];
  bars: { ts: string; x: number; h: number }[];
  ticks: { year: number; x: number }[];
}

/**
 * Lays out `captures` (time order) and the meaningful `changes` (by their newer capture) in a deck `width` px wide.
 * Wide decks use half-width cards stepping 8 px; phones two-thirds-width cards stepping 5 px. Year ticks thin out to
 * every 2nd or 5th year when years sit closer than 40 px.
 */
export function deckLayout(captures: readonly string[], changes: readonly { to: string; score: number }[], width: number): DeckLayout {
  const wide = width >= 720;
  const cardW = Math.round(wide ? width / 2 : width * 0.67);
  const cardH = Math.round((cardW * 10) / 16);
  const step = wide ? 8 : 5;
  const span = width - cardW;
  const [t0, t1] = [ts2ms(captures[0] ?? ''), ts2ms(captures.at(-1) ?? '')];
  const x = (ts: string) => (t1 > t0 ? ((ts2ms(ts) - t0) / (t1 - t0)) * span : span);
  const cards = captures.map((ts, i) => ({ ts, x: x(ts), y: i * step }));
  const axisTop = Math.max(0, captures.length - 1) * step + cardH + AXIS_GAP;
  const perYear = t1 > t0 ? (span * 365.25 * 864e5) / (t1 - t0) : Infinity;
  const every = [1, 2, 5, 10].find((k) => k * perYear >= 40) ?? 10;
  const ticks: DeckLayout['ticks'] = [];
  for (let year = new Date(t0).getUTCFullYear() + 1; Date.UTC(year, 0, 1) <= t1; year++) {
    if (year % every === 0) ticks.push({ year, x: ((Date.UTC(year, 0, 1) - t0) / (t1 - t0)) * span });
  }
  return {
    cardW,
    cardH,
    step,
    span,
    axisTop,
    height: axisTop + AXIS_BAND,
    cards,
    bars: changes.map((c) => ({ ts: c.to, x: x(c.to), h: barHeight(c.score) })),
    ticks,
  };
}

/** `Sep 2014`: a capture's month and year, for the deck's caption. */
export const monthYear = (ts: string) => formatTimestampShort(ts).replace(/^\d+ /, '');
