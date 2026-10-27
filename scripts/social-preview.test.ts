import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast } from '../src/design/cvd.ts';
import { palette } from '../src/design/palette.ts';

const root = resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('social preview', () => {
  const svg = read('assets/social-preview.svg');

  it('is 1280×640 and its PNG is under 1 MB', () => {
    expect(svg).toMatch(/<svg [^>]*width="1280" height="640"/);
    const png = readFileSync(join(root, 'assets/social-preview.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1280, 640]);
    expect(statSync(join(root, 'assets/social-preview.png')).size).toBeLessThan(1_000_000);
  });

  it('is served as public/social-preview.png, the same file', () => {
    expect(readFileSync(join(root, 'public/social-preview.png')).equals(readFileSync(join(root, 'assets/social-preview.png')))).toBe(true);
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

describe('link-preview card', () => {
  it('is a 1200×630 JPEG og:image with the same card moving as og:video', () => {
    const jpg = readFileSync(join(root, 'public/og.jpg'));
    expect(jpg.readUInt16BE(0)).toBe(0xffd8);
    expect(jpg.length).toBeLessThan(300_000);
    expect(statSync(join(root, 'public/og.mp4')).size).toBeLessThan(1_000_000);
    const html = read('index.html');
    expect(html).toContain('<meta property="og:image" content="https://pagelapse.geekplux.com/og.jpg" />');
    expect(html).toContain('<meta property="og:video" content="https://pagelapse.geekplux.com/og.mp4" />');
    expect(html).toContain('<meta property="og:video:type" content="video/mp4" />');
  });
});
