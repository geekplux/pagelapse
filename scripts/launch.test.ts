import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast } from '../src/design/cvd.ts';
import { palette } from '../src/design/palette.ts';
import { fencedAfter, section, xLength } from './lib/launch.ts';

const root = resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('xLength', () => {
  it('counts code points, and every link as 23', () => {
    expect(xLength('abc')).toBe(3);
    expect(xLength('a — b')).toBe(5);
    expect(xLength('see https://github.com/geekplux/pagelapse')).toBe(4 + 23);
    expect(xLength('x https://a.b y http://c.d/e')).toBe(5 + 46);
  });
});

describe('docs/LAUNCH.md', () => {
  const md = read('docs/LAUNCH.md');

  it('opens by saying it holds drafts only', () => {
    expect(md.split('\n')[0]).toBe('Drafts only. Nothing has been posted.');
  });

  it('has an X post of at most 280 characters', () => {
    const post = fencedAfter(md, 'X post');
    expect(post).toBeDefined();
    expect(xLength(post!)).toBeLessThanOrEqual(280);
  });

  it('has every part: Show HN, three demo scenarios, the comparison and the non-goals', () => {
    const hn = section(md, 'Show HN');
    expect(hn).toContain("Show HN: Pagelapse – watch a web page's decade in 15 seconds");
    const words = hn.split(/\*\*Post:\*\*/)[1]!.split(/\s+/).filter((w) => /\w/.test(w)).length;
    expect(words).toBeGreaterThan(120);
    expect(words).toBeLessThan(200);
    expect(section(md, 'Demo scenarios').match(/^### /gm)).toHaveLength(3);
    const table = section(md, 'Comparison');
    for (const name of ['Changes view', 'Visualping', 'changedetection.io', 'Manual tab-by-tab', 'Wikipedia page history']) expect(table).toContain(name);
    expect(section(md, "What we deliberately don't do").match(/^- /gm)?.length).toBeGreaterThanOrEqual(4);
  });

  it('stays clear of money talk', () => {
    expect(md).not.toMatch(/[$€£¥]|\b(price|pricing|crypto|trading|stocks?|invest\w*|payments?)\b/i);
  });
});

describe('social preview', () => {
  const svg = read('assets/social-preview.svg');

  it('is 1280×640 and its PNG is under 1 MB', () => {
    expect(svg).toMatch(/<svg [^>]*width="1280" height="640"/);
    const png = readFileSync(join(root, 'assets/social-preview.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1280, 640]);
    expect(statSync(join(root, 'assets/social-preview.png')).size).toBeLessThan(1_000_000);
  });

  it('is also the site\'s og:image: public/social-preview.png is the same file, linked from index.html', () => {
    expect(readFileSync(join(root, 'public/social-preview.png')).equals(readFileSync(join(root, 'assets/social-preview.png')))).toBe(true);
    expect(read('index.html')).toContain('<meta property="og:image" content="https://pagelapse.geekplux.com/social-preview.png" />');
  });

  it('sets its text in the light theme\'s colours, each passing AA on the ground and on the picture tags', () => {
    const p = palette.light;
    expect(svg).toContain(`fill="${p.bg}"`);
    for (const fg of [p['sand-12'], p['sand-11'], p['cyan-11'], p['amber-11']]) {
      expect(svg).toContain(`fill="${fg}"`);
      expect(contrast(fg, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, p.frame)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses the self-hosted fonts and no middle dot', () => {
    expect(svg).toContain('../public/fonts/SchibstedGrotesk-Variable-latin.woff2');
    expect(svg).toContain('../public/fonts/IBMPlexMono-Regular-latin.woff2');
    expect(svg).not.toContain('\u00B7');
  });
});
