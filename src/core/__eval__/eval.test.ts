/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { diffPages } from '../diff.ts';
import { scoreDiff } from '../score.ts';
import type { Block, ExtractedPage, Magnitude } from '../types.ts';

/** A labelled before/after pair. Blocks are shorthand: `# h1`, `## h2`, `- list item`, else a paragraph. */
interface EvalCase {
  id: string;
  label: Magnitude;
  note: string;
  before: { title: string; blocks: string[] };
  after: { title: string; blocks: string[] };
}

const files = import.meta.glob<EvalCase[]>('./cases/*.json', { eager: true, import: 'default' });
const cases = Object.values(files).flat();
const LABELS: Magnitude[] = ['trivial', 'minor', 'moderate', 'major'];

function block(text: string): Block {
  const h = /^(#{1,6}) (.*)$/.exec(text);
  if (h) return { kind: 'heading', text: h[2]!, level: h[1]!.length as Block['level'] };
  return text.startsWith('- ') ? { kind: 'list-item', text: text.slice(2) } : { kind: 'paragraph', text };
}
const page = (p: EvalCase['before']): ExtractedPage => ({ title: p.title, blocks: p.blocks.map(block) });

describe('significance eval set', () => {
  const results = cases.map((c) => {
    const [a, b] = [page(c.before), page(c.after)];
    return { ...c, got: scoreDiff(diffPages(a, b), a, b) };
  });

  it('has >= 24 labelled cases covering every magnitude', () => {
    expect(cases.length).toBeGreaterThanOrEqual(24);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const l of LABELS) expect(cases.filter((c) => c.label === l).length).toBeGreaterThanOrEqual(5);
  });

  it('drops every must-drop trivial case and agrees on >= 90% overall', () => {
    const matrix = LABELS.map((want) => LABELS.map((got) => results.filter((r) => r.label === want && r.got.magnitude === got).length));
    const agree = results.filter((r) => r.label === r.got.magnitude).length / results.length;
    const rows = matrix.map((row, i) => `${LABELS[i]!.padEnd(9)}${row.map((n) => String(n).padStart(9)).join('')}`);
    const misses = results.filter((r) => r.label !== r.got.magnitude).map((r) => `  ${r.id}: want ${r.label}, got ${r.got.magnitude} (${r.got.score}) ${r.got.reasons.join("; ")}`);
    process.stdout.write(`expected \\ got${LABELS.map((l) => l.padStart(9)).join('')}\n${rows.join('\n')}\nagreement ${(agree * 100).toFixed(1)}%\n${misses.join('\n')}\n`);
    expect(results.filter((r) => r.label === 'trivial' && r.got.magnitude !== 'trivial').map((r) => r.id)).toEqual([]);
    expect(agree).toBeGreaterThanOrEqual(0.9);
  });

  it('scores stay in 0..1 with reasons', () => {
    for (const r of results) {
      expect(r.got.score).toBeGreaterThanOrEqual(0);
      expect(r.got.score).toBeLessThanOrEqual(1);
      expect(r.got.reasons.length).toBeGreaterThan(0);
    }
  });
});
