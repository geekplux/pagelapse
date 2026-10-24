import { describe, expect, it } from 'vitest';
import { barHeight, hairline, nearestX, stepIndex, tsToMs, yearLabels, yearScale } from './scale.ts';

const y = (year: number, m = 0, d = 1) => Date.UTC(year, m, d);

describe('yearScale', () => {
  it('spans 1 January of the first year to 1 January after the last, ticks at both ends', () => {
    // The Wikipedia sample on the 1200 px board: Sep 2014 to Feb 2026 is 2014 to 2027.
    const s = yearScale([y(2014, 8, 10), y(2026, 1, 10)], 1200);
    expect(s.ticks.map((t) => t.year)).toEqual([2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
    expect(s.ticks[0]!.x).toBe(0);
    expect(s.ticks.at(-1)!.x).toBe(1200);
    expect(s.x(y(2014, 8, 10))).toBeCloseTo(63.8, 0);
    expect(tsToMs('20150101000000')).toBe(y(2015));
  });
});

describe('marks', () => {
  it('a bar is 6 + sqrt(score) x 38 px tall, clamped to the 0..1 score range', () => {
    expect(barHeight(0)).toBe(6);
    expect(barHeight(1)).toBe(44);
    expect(barHeight(0.25)).toBe(25);
    expect(barHeight(2)).toBe(44);
  });
  it('a hairline drops 6 px, then bends to its date like the board', () => {
    expect(hairline(39.1, 63.8, 96)).toBe('M39.1 0V6C39.1 52.8 63.8 43.2 63.8 96');
    expect(hairline(902, 942.3, 74.8)).toBe('M902 0V6C902 41.1 942.3 33.7 942.3 74.8');
  });
});

describe('yearLabels', () => {
  it('labels every year when there is room, the ends anchored to the edges', () => {
    const { ticks } = yearScale([y(2014, 8), y(2026, 1)], 1200);
    const labels = yearLabels(ticks, 1200);
    expect(labels).toHaveLength(14);
    expect(labels[0]).toMatchObject({ year: 2014, anchor: 'start' });
    expect(labels[1]).toMatchObject({ year: 2015, anchor: 'middle' });
    expect(labels.at(-1)).toMatchObject({ year: 2027, anchor: 'end' });
  });
  it('thins the labels on a phone so none overlaps', () => {
    const { ticks } = yearScale([y(2014, 8), y(2026, 1)], 358);
    const labels = yearLabels(ticks, 358);
    expect(labels.map((l) => l.year)).toEqual([2014, 2016, 2018, 2020, 2022, 2024, 2026]);
    const box = (l: (typeof labels)[number]) => (l.anchor === 'start' ? [l.x, l.x + 29] : l.anchor === 'end' ? [l.x - 29, l.x] : [l.x - 14.5, l.x + 14.5]);
    labels.slice(1).forEach((l, i) => expect(box(l)[0]!).toBeGreaterThanOrEqual(box(labels[i]!)[1]! + 8));
    // 30 years in 358 px: a five-year stride.
    expect(yearLabels(yearScale([y(1996), y(2025)], 358).ticks, 358).map((l) => l.year)).toEqual([1996, 2001, 2006, 2011, 2016, 2021, 2026]);
  });
});

describe('nearestX', () => {
  it('snaps on x only: a horizontal drag across bars of different heights never picks a neighbour', () => {
    // Two bars 10 px apart; the pointer moves along y = 60, near the tall bar's top (y 56) and far below the short one's (y 94).
    const xs = [100, 110];
    const tops = [56, 94];
    const nearest2d = (x: number, py: number) => [0, 1].reduce((b, i) => (Math.hypot(xs[i]! - x, tops[i]! - py) < Math.hypot(xs[b]! - x, tops[b]! - py) ? i : b));
    // At x = 108 a 2D snap still says the tall bar (the old behaviour); on x the pointer is over the short one.
    expect(nearest2d(108, 60)).toBe(0);
    expect(nearestX(xs, 108)).toBe(1);
    // Dragging left to right selects each bar in turn, never flipping back.
    const picks = [96, 100, 104, 106, 110, 114].map((x) => nearestX(xs, x));
    expect(picks).toEqual([0, 0, 0, 1, 1, 1]);
    expect(nearestX([], 5)).toBe(-1);
  });
});

describe('stepIndex', () => {
  const times = [y(2014), y(2014, 3), y(2015, 1), y(2015, 2), y(2018)];
  it('steps, jumps and clamps', () => {
    expect(stepIndex('ArrowRight', 0, times)).toBe(1);
    expect(stepIndex('ArrowLeft', 0, times)).toBe(0);
    expect(stepIndex('ArrowRight', 4, times)).toBe(4);
    expect(stepIndex('Home', 3, times)).toBe(0);
    expect(stepIndex('End', 0, times)).toBe(4);
    expect(stepIndex('Tab', 0, times)).toBeNull();
  });
  it('PageUp/PageDown move about a year, at least one step', () => {
    expect(stepIndex('PageUp', 0, times)).toBe(2);
    expect(stepIndex('PageUp', 2, times)).toBe(4);
    expect(stepIndex('PageDown', 4, times)).toBe(3);
    expect(stepIndex('PageDown', 1, times)).toBe(0);
  });
});
