import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureToSnapshots, parseSampleFixture } from '../../src/core/fixture.ts';
import { buildTimeline } from '../../src/core/timeline.ts';
import { overviewPair } from '../../src/app/visual/visualState.ts';
import { checkPictures } from './pictures.ts';
import { webpSize } from './webpInfo.ts';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
/** A RIFF/WEBP header whose first chunk is `tag` with `body`, padded to 32 bytes. */
const riff = (tag: string, body: number[]) =>
  Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(tag), 0, 0, 0, 0, ...body, ...Array(12).fill(0)]);

describe('webpSize', () => {
  it('reads lossy, lossless and extended headers', () => {
    expect(webpSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0xc0, 0x03, 0x58, 0x02]))).toEqual({ w: 960, h: 600 });
    // VP8L: 0x2f, then 14 bits width-1 (319) and 14 bits height-1 (199).
    const bits = 319 | (199 << 14);
    expect(webpSize(riff('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, bits >>> 24]))).toEqual({ w: 320, h: 200 });
    expect(webpSize(riff('VP8X', [0, 0, 0, 0, 0xff, 0x04, 0, 0x1f, 0x03, 0]))).toEqual({ w: 1280, h: 800 });
  });

  it('rejects other files', () => {
    expect(() => webpSize(Uint8Array.from(ascii('\x89PNG\r\n\x1a\n'.padEnd(40))))).toThrow('not a WebP file');
    expect(() => webpSize(riff('ALPH', []))).toThrow('unknown WebP chunk');
  });
});

describe('committed sample pictures', () => {
  const root = resolve(import.meta.dirname, '../..');

  it('exist for every capture, fit their dimensions and budgets, and leave no orphans', () => {
    const report = checkPictures(root);
    expect(report.problems).toEqual([]);
    expect(report.count).toBeGreaterThan(0);
  });

  it.each(['git-scm', 'rust-lang', 'wikipedia-internet-archive'])('%s features a meaningful change with two good pictures', (id) => {
    const f = parseSampleFixture(JSON.parse(readFileSync(join(root, 'src/samples', `${id}.json`), 'utf8')));
    const pairs = buildTimeline(f.url, fixtureToSnapshots(f)).entries.map((e) => `${e.from}-${e.to}`);
    expect(pairs).toContain(f.featured);
    const shot = (ts?: string) => f.snapshots.find((s) => s.ts === ts)?.shot?.status;
    expect(f.featured!.split('-').map(shot)).toEqual(['ok', 'ok']);
    expect(f.visual).toMatchObject({ archive: 'arquivo-pt', format: 'webp' });
  });

  it('opens the default sample on its decade compare: the first capture against the latest, both complete', () => {
    const f = parseSampleFixture(JSON.parse(readFileSync(join(root, 'src/samples', 'git-scm.json'), 'utf8')));
    expect(overviewPair(f.snapshots)).toEqual({ from: f.snapshots[0]!.ts, to: f.snapshots.at(-1)!.ts, skipped: 0 });
  });
});
