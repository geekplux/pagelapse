import { describe, expect, it } from 'vitest';
import { parseSampleFixture } from '../core/fixture.ts';
import { defaultSample, samples } from './index.ts';
import config from './samples.config.json';

const RAW = import.meta.glob<string>(['./*.json', '!./samples.config.json'], { query: '?raw', import: 'default', eager: true });
const KB = 1000;
/** Monetary figures and finance terms; no committed sample may state any (CLAUDE.md: nothing finance-related). */
const FINANCE =
  /[$€£¥]\s?\d|\bUS\$|\d[\d,.]*\s?(million|billion)\s+(dollars|euros)|\b(dollars|euros)\b|\bbudget\b|\brevenue\b|\bassets\b|\bfunding of\b|\bdonations? of (US)?[$€£¥]/i;

async function gzipBytes(text: string): Promise<number> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

describe('committed samples', () => {
  it('match the recorder config and the registry; git-scm is the default (D23)', () => {
    const ids = config.map((c) => c.id);
    expect(Object.keys(RAW).sort()).toEqual(ids.map((id) => `./${id}.json`).sort());
    expect(samples.map((s) => s.id)).toEqual(ids);
    expect(defaultSample.id).toBe('git-scm');
  });

  it.each(Object.entries(RAW))('%s is real, chronological, unique and small', (file, raw) => {
    const f = parseSampleFixture(JSON.parse(raw));
    const cfg = config.find((c) => `./${c.id}.json` === file)!;
    expect(f).toMatchObject({ id: cfg.id, url: cfg.url, source: { license: cfg.license, attribution: cfg.attribution } });
    expect(['internet-archive', 'arquivo-pt']).toContain(f.source.archive);
    expect(f.source.recorder).toMatch(/^pagelapse record-samples /);
    expect(f.snapshots.length).toBeGreaterThanOrEqual(8);
    expect(new Set(f.snapshots.map((s) => s.digest)).size).toBe(f.snapshots.length);
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(150 * KB);
  });

  it.each(Object.entries(RAW))('%s states no monetary figures in any block', (_, raw) => {
    const f = parseSampleFixture(JSON.parse(raw));
    expect(f.blocks.map((b) => b.t).filter((t) => FINANCE.test(t))).toEqual([]);
    expect(f.snapshots.map((s) => s.title).filter((t) => FINANCE.test(t))).toEqual([]);
  });

  it('default sample is <= 40 KB gzip (AC 30)', async () => {
    expect(await gzipBytes(RAW[`./${defaultSample.id}.json`]!)).toBeLessThanOrEqual(40 * KB);
  });

  it('loads every registered sample', async () => {
    for (const s of samples) expect((await s.load()).id).toBe(s.id);
  });
});
