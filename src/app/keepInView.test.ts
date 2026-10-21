import { describe, expect, it } from 'vitest';
import { keepInView } from './keepInView.ts';

describe('keepInView', () => {
  it('leaves a fully visible item alone', () => {
    expect(keepInView(100, 40, 80, 200)).toBeNull();
    // Touching either edge still counts as visible.
    expect(keepInView(80, 40, 80, 200)).toBeNull();
    expect(keepInView(240, 40, 80, 200)).toBeNull();
  });

  it('centres an item that is below, above or cut by an edge', () => {
    expect(keepInView(600, 100, 0, 200)).toBe(550);
    expect(keepInView(0, 100, 300, 200)).toBe(-50);
    expect(keepInView(180, 40, 0, 200)).toBe(100);
  });

  it('centres an item taller than the box on its middle', () => {
    expect(keepInView(500, 300, 0, 200)).toBe(550);
  });

  it('does not count an edge covered by scroll padding as visible, and centres in what is left', () => {
    // A 30 px sticky heading covers the top of a 200 px box.
    expect(keepInView(10, 40, 0, 200, 30)).toBe(-85);
    expect(keepInView(40, 40, 0, 200, 30)).toBeNull();
    expect(keepInView(150, 40, 0, 200, 0, 20)).toBe(80);
  });
});
