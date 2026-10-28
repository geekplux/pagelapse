import { existsSync, readFileSync, statSync } from 'node:fs';
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

  it('counts the hero deck as the first view: thumbnails behind the latest card, the latest full size', () => {
    const f = parseSampleFixture(JSON.parse(readFileSync(join(root, 'src/samples', 'wikipedia-internet-archive.json'), 'utf8')));
    const files = f.snapshots.flatMap((s) => (s.shot?.file ? [s.shot.file] : []));
    const size = (name: string) => statSync(join(root, 'public/samples/wikipedia-internet-archive', name)).size;
    const want = files.slice(0, -1).reduce((n, file) => n + size(`${file}.thumb.webp`), 0) + size(`${files.at(-1)}.webp`);
    expect(checkPictures(root).firstView).toBe(want);
  });

  it.each(['wikipedia-internet-archive', 'nasa', 'creative-commons', 'wikipedia-pluto', 'wikipedia-world-wide-web', 'weather-gov', 'geekplux'])('%s features a meaningful change with two pictures', (id) => {
    const f = parseSampleFixture(JSON.parse(readFileSync(join(root, 'src/samples', `${id}.json`), 'utf8')));
    const pairs = buildTimeline(f.url, fixtureToSnapshots(f)).entries.map((e) => `${e.from}-${e.to}`);
    expect(pairs).toContain(f.featured);
    const shot = (ts?: string) => f.snapshots.find((s) => s.ts === ts)?.shot;
    // Both sides pictured (NASA's 2000 capture is a partial copy: its images are missing, its layout is not).
    for (const s of f.featured!.split('-').map(shot)) expect([s?.status !== 'failed', !!s?.file]).toEqual([true, true]);
    // Pictured from the archive the text came from (Arquivo.pt; the Internet Archive for GeekPlux, which Arquivo.pt barely holds).
    expect(f.visual).toMatchObject({ archive: f.source.archive, format: 'webp' });
    expect(f.source.archive).toBe(id === 'geekplux' ? 'internet-archive' : 'arquivo-pt');
  });

  it('drops the pictures samples.config.json lists in visualDrop: no file, the reason on the capture', () => {
    const config = JSON.parse(readFileSync(join(root, 'src/samples/samples.config.json'), 'utf8')) as { id: string; visualDrop?: Record<string, string> }[];
    const drops = config.flatMap((c) => Object.entries(c.visualDrop ?? {}).map(([ts, reason]) => [c.id, ts, reason] as const));
    // Creative Commons' 2011 capture shows a fundraising price in its slider caption (CLAUDE.md: nothing finance-related).
    expect(drops).toContainEqual(['creative-commons', '20111209164214', 'Hidden: a fundraising appeal']);
    for (const [id, ts, reason] of drops) {
      const f = parseSampleFixture(JSON.parse(readFileSync(join(root, 'src/samples', `${id}.json`), 'utf8')));
      expect(f.snapshots.find((s) => s.ts === ts)?.shot).toEqual({ status: 'failed', settle: expect.any(String), reason });
    }
  });

  it('pictures both sides of every pair a sample opens on: each featured change, and the default\'s decade compare', () => {
    const config = JSON.parse(readFileSync(join(root, 'src/samples/samples.config.json'), 'utf8')) as { id: string }[];
    const ids = config.map((c) => c.id).filter((id) => existsSync(join(root, 'src/samples', `${id}.json`)));
    for (const [i, id] of ids.entries()) {
      const f = parseSampleFixture(JSON.parse(readFileSync(join(root, 'src/samples', `${id}.json`), 'utf8')));
      const pairs = [f.featured, ...(i === 0 ? [(({ from, to }) => `${from}-${to}`)(overviewPair(f.snapshots)!)] : [])];
      for (const pair of pairs) {
        const sides = pair!.split('-').map((ts) => f.snapshots.find((s) => s.ts === ts)?.shot);
        expect([id, pair, sides.map((s) => !!s?.file && s.status !== 'failed')]).toEqual([id, pair, [true, true]]);
      }
    }
  });

  it('opens the default sample on its decade compare: its earliest complete capture against the latest', () => {
    const f = parseSampleFixture(JSON.parse(readFileSync(join(root, 'src/samples', 'wikipedia-internet-archive.json'), 'utf8')));
    // The 2014 and 2015 captures are partial copies, so the compare starts in 2018 (examples/README.md says so too).
    expect(overviewPair(f.snapshots)).toEqual({ from: '20180425033645', to: f.snapshots.at(-1)!.ts, skipped: 2 });
  });
});
