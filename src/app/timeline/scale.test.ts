import { describe, expect, it } from 'vitest';
import { MARKER_R, markerRadius, nearestPoint, stackLevels, stepIndex, timeScale, tsToMs, yearLabels, yearTicks } from './scale.ts';

const y = (year: number, m = 0) => Date.UTC(year, m, 1);

describe('timeScale and ticks', () => {
  it('maps the padded domain onto the range, in order', () => {
    const s = timeScale([y(2014), y(2024)], 0, 1000);
    expect(s.x(y(2014))).toBeGreaterThan(0);
    expect(s.x(y(2024))).toBeLessThan(1000);
    expect(s.x(y(2019))).toBeCloseTo(500, 0);
    expect(timeScale([y(2020)], 0, 100).x(y(2020))).toBeCloseTo(50);
  });
  it('lists 1 January of each inner year', () => {
    expect(yearTicks(y(2014, 5), y(2017, 2)).map((t) => t.year)).toEqual([2015, 2016, 2017]);
    expect(tsToMs('20150101000000')).toBe(y(2015));
  });
  it('labels with a wider stride when dense and skips labels colliding with the selection or edges', () => {
    const ticks = [2014, 2015, 2016, 2017, 2018].map((year, i) => ({ year, x: 20 + i * 30 }));
    const opts = { minGap: 44, half: 16, width: 200 };
    expect(yearLabels(ticks, 30, opts).map((t) => t.year)).toEqual([2014, 2016, 2018]);
    expect(yearLabels(ticks, 60, { ...opts, avoid: [60, 90] }).map((t) => t.year)).toEqual([2014, 2017, 2018]);
    expect(yearLabels(ticks, 60, { ...opts, width: 150 }).map((t) => t.year)).toEqual([2014, 2015, 2016, 2017]);
  });
});

describe('markers', () => {
  it('radius is one step per magnitude, each step at least twice the area of the one below', () => {
    expect([markerRadius('minor'), markerRadius('moderate'), markerRadius('major')]).toEqual([6, 9.5, 13.5]);
    expect(markerRadius('trivial')).toBe(MARKER_R.minor);
    const area = (r: number) => r ** 2;
    expect(area(MARKER_R.moderate) / area(MARKER_R.minor)).toBeGreaterThan(2);
    expect(area(MARKER_R.major) / area(MARKER_R.moderate)).toBeGreaterThan(2);
  });
  it('stacks colliding markers upward and keeps 24 px between neighbours on a level', () => {
    expect(stackLevels([0, 2, 4, 100], [6, 6, 6, 6])).toEqual([0, 1, 2, 0]);
    expect(stackLevels([0, 20], [5, 5])).toEqual([0, 1]);
    expect(stackLevels([0, 2, 4, 6], [6, 6, 6, 6])).toEqual([0, 1, 2, 2]);
    // Two majors need 13.5 + 13.5 + 3 px between centres; minors still keep the 24 px pointer spacing.
    const { major, minor } = MARKER_R;
    expect(stackLevels([0, 29], [major, major])).toEqual([0, 1]);
    expect(stackLevels([0, 30], [major, major])).toEqual([0, 0]);
    expect(stackLevels([0, 23], [minor, minor])).toEqual([0, 1]);
    expect(stackLevels([0, 24], [minor, minor])).toEqual([0, 0]);
  });
  it('finds the nearest point', () => {
    expect(nearestPoint([{ x: 0, y: 0 }, { x: 10, y: 0 }], 7, 1).index).toBe(1);
    expect(nearestPoint([], 0, 0).index).toBe(-1);
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
