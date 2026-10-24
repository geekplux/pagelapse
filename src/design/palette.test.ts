import { describe, expect, it } from 'vitest';
import { type CvdKind, contrast, deltaE, lightness } from './cvd.ts';
import { TOKENS, type Theme, type Token, palette } from './palette.ts';
import tokensCss from './tokens.css?raw';

const THEMES: Theme[] = ['light', 'dark'];
const CVD: (CvdKind | undefined)[] = [undefined, 'protan', 'deutan', 'tritan'];

// [foreground, background, minimum ratio]: every pair the UI draws (docs/redesign/DESIGN.md).
const PAIRS: [Token, Token, number][] = [
  // Text (WCAG 1.4.3): >= 4.5:1. sand-12 and sand-11 on every surface; the Before / After words on the ground and on
  // the picture frame; the solid button's label; removed rows and words (sand-11 text) and added ones (sand-12).
  ['sand-12', 'bg', 4.5], ['sand-12', 'frame', 4.5], ['sand-12', 'sand-2', 4.5], ['sand-12', 'sand-3', 4.5],
  ['sand-11', 'bg', 4.5], ['sand-11', 'frame', 4.5], ['sand-11', 'sand-2', 4.5], ['sand-11', 'sand-3', 4.5],
  ['cyan-11', 'bg', 4.5], ['amber-11', 'bg', 4.5], ['cyan-11', 'frame', 4.5], ['amber-11', 'frame', 4.5],
  ['sand-1', 'sand-12', 4.5],
  ['sand-11', 'cyan-2', 4.5], ['sand-11', 'cyan-3', 4.5], ['sand-12', 'amber-2', 4.5], ['sand-12', 'amber-4', 4.5],
  // Graphics (WCAG 1.4.11): >= 3:1. The magnitude bars and dots (sand-9 up), the Before / After rings and the selected
  // change (cyan-11, amber-11, also on the selected row's sand-2 and the added row's amber-2), the focus ring.
  ['sand-9', 'bg', 3], ['sand-9', 'frame', 3], ['sand-11', 'bg', 3], ['sand-12', 'bg', 3],
  ['cyan-11', 'sand-2', 3], ['amber-11', 'sand-2', 3], ['cyan-11', 'cyan-2', 3], ['amber-11', 'amber-2', 3],
];

describe.each(THEMES)('%s theme', (theme) => {
  const p = palette[theme];

  it.each(PAIRS)('%s on %s >= %d:1', (fg, bg, min) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(CVD)('Before (cyan-11) and After (amber-11) stay far apart (OKLab ΔE×100 >= 15), sim: %s', (kind) => {
    expect(deltaE(p['cyan-11'], p['amber-11'], kind)).toBeGreaterThanOrEqual(15);
  });

  // The word marks are told apart by line-through vs underline first; their fills only repeat it.
  it.each(CVD)('removed (cyan-3) and added (amber-4) word fills stay apart (ΔE×100 >= 6), sim: %s', (kind) => {
    expect(deltaE(p['cyan-3'], p['amber-4'], kind)).toBeGreaterThanOrEqual(6);
  });

  // Overlays on a picture (Before / After tags, the live tag) sit on a bg backing with a hairline and shadow, so
  // against any picture, white or black, the backing or its text clears 3:1, and the text clears 4.5:1 on its backing.
  it.each(['#FFFFFF', '#000000'])('overlays stay visible on a %s picture', (image) => {
    expect(Math.max(contrast(p['sand-12'], image), contrast(p.bg, image))).toBeGreaterThanOrEqual(3);
    expect(contrast(p['sand-12'], p.bg)).toBeGreaterThanOrEqual(4.5);
  });

  // The selected filmstrip frame: a sand-12 ring on a 2 px bg gap; against any thumbnail edge, the ring or its gap holds.
  it.each(['#FFFFFF', '#000000'])('selected-frame ring holds on a %s thumbnail edge', (edge) => {
    expect(Math.max(contrast(p['sand-12'], edge), contrast(p.bg, edge))).toBeGreaterThanOrEqual(3);
  });

  it('magnitude ramp (minor sand-9, moderate sand-11, major sand-12) moves away from the ground in lightness', () => {
    const ls = (['sand-9', 'sand-11', 'sand-12'] as const).map((t) => lightness(p[t]));
    const dir = theme === 'light' ? -1 : 1;
    for (let i = 1; i < ls.length; i++) expect(dir * (ls[i]! - ls[i - 1]!)).toBeGreaterThan(0.05);
  });

  it('every Radix ramp gets steadily further from the ground from step 1 to 12, as its roles assume', () => {
    for (const scale of ['sand', 'cyan', 'amber'] as const) {
      const c = (n: number) => contrast(p[`${scale}-${n}` as Token], p.bg);
      // Step 9 is the solid (amber-9 is a bright yellow), so only the background, border and text steps are ordered.
      for (const [a, b] of [[1, 3], [3, 6], [6, 8], [8, 11], [11, 12]] as const) expect(c(b)).toBeGreaterThan(c(a));
    }
  });
});

it('the ground is white in light and sand-1 in dark; pictures sit on white and sand-2', () => {
  expect([palette.light.bg, palette.light.frame]).toEqual(['#FFFFFF', '#FFFFFF']);
  expect([palette.dark.bg, palette.dark.frame]).toEqual([palette.dark['sand-1'], palette.dark['sand-2']]);
});

describe('tokens.css mirrors palette.ts', () => {
  const read = (block: string) =>
    Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]!.toUpperCase()]));
  const darkStart = tokensCss.indexOf('@media (prefers-color-scheme: dark)');
  const blocks: Record<Theme, string> = { light: tokensCss.slice(0, darkStart), dark: tokensCss.slice(darkStart) };

  it.each(THEMES)('%s values are equal', (theme) => {
    expect(darkStart).toBeGreaterThan(0);
    const expected = Object.fromEntries(TOKENS.map((t) => [t, palette[theme][t].toUpperCase()]));
    expect(read(blocks[theme])).toEqual(expected);
  });
});
