import { describe, expect, it } from 'vitest';
import { silhouette } from './silhouette.ts';
import type { Block } from './types.ts';

const para = (n: number): Block => ({ kind: 'paragraph', text: 'x'.repeat(n) });

describe('silhouette', () => {
  it('starts with the title bar, then a bar per heading and lines per paragraph', () => {
    const bars = silhouette({ title: 'Git', blocks: [{ kind: 'heading', level: 1, text: 'About' }, para(100), { kind: 'list-item', text: 'one' }] });
    expect(bars.map((b) => b.kind)).toEqual(['title', 'heading', 'text', 'text', 'text']);
    expect(bars[1]!.h).toBeGreaterThan(bars[2]!.h);
    // A short last line is shorter than a full one; list items are indented.
    expect(bars[3]!.w).toBeLessThan(bars[2]!.w);
    expect(bars[4]!.x).toBeGreaterThan(bars[2]!.x);
  });

  it('stays inside the 320×200 box, however long the page', () => {
    const bars = silhouette({ title: 'T'.repeat(500), blocks: Array.from({ length: 200 }, () => para(400)) });
    for (const b of bars) {
      expect(b.x + b.w).toBeLessThanOrEqual(320);
      expect(b.y + b.h).toBeLessThanOrEqual(200);
    }
    expect(bars.length).toBeLessThan(60);
  });

  it('is deterministic and draws an empty page as its title only', () => {
    const page = { title: 'Rust', blocks: [para(70)] };
    expect(silhouette(page)).toEqual(silhouette(page));
    expect(silhouette({ title: '', blocks: [] })).toHaveLength(1);
  });
});
