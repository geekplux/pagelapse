import { describe, expect, it } from 'vitest';
import { type CvdKind, contrast, deltaE, lightness } from './cvd.ts';
import { TOKENS, type Theme, type Token, darkFillVariants, palette } from './palette.ts';
import tokensCss from './tokens.css?raw';

const THEMES: Theme[] = ['light', 'dark'];
const CVD: (CvdKind | undefined)[] = [undefined, 'protan', 'deutan', 'tritan'];

// [foreground, background, minimum ratio]: every pair from docs/PLAN.md section 4.
const PAIRS: [Token, Token, number][] = [
  // Text (WCAG 1.4.3): >= 4.5:1.
  ['ink', 'paper', 4.5], ['ink', 'card', 4.5], ['ink-2', 'paper', 4.5], ['ink-2', 'card', 4.5],
  ['added', 'card', 4.5], ['added', 'paper', 4.5], ['removed', 'card', 4.5], ['removed', 'paper', 4.5],
  ['ink', 'added-tint', 4.5], ['ink', 'removed-tint', 4.5], ['added', 'added-tint', 4.5], ['removed', 'removed-tint', 4.5],
  // UI boundaries and graphics (WCAG 1.4.11): >= 3:1. Focus ring = ink ring around a card gap.
  ['rule-strong', 'paper', 3], ['rule-strong', 'card', 3], ['ink', 'paper', 3],
  // Every magnitude marker step, against both surfaces it can sit on.
  ['mag-1', 'card', 3], ['mag-2', 'card', 3], ['mag-3', 'card', 3], ['mag-4', 'card', 3],
  ['mag-1', 'paper', 3], ['mag-2', 'paper', 3], ['mag-3', 'paper', 3], ['mag-4', 'paper', 3],
  ['card', 'ink', 3], ['mark-plus', 'ink', 3], ['mark-minus', 'ink', 3],
];

describe.each(THEMES)('%s theme', (theme) => {
  const p = palette[theme];

  it.each(PAIRS)('%s on %s >= %d:1', (fg, bg, min) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(CVD)('added/removed and logo ± stay apart (OKLab ΔE×100 >= 8), sim: %s', (kind) => {
    expect(deltaE(p.added, p.removed, kind)).toBeGreaterThanOrEqual(8);
    expect(deltaE(p['mark-plus'], p['mark-minus'], kind)).toBeGreaterThanOrEqual(8);
  });

  // AC 25: picture overlays (divider, handle, Before/After chips) are ink on a card backing or halo, so against any
  // picture, white or black, one of the two clears 3:1, and the chip text clears 4.5:1 on its own backing.
  it.each(['#FFFFFF', '#000000'])('overlays stay visible on a %s picture', (image) => {
    expect(Math.max(contrast(p.ink, image), contrast(p.card, image))).toBeGreaterThanOrEqual(3);
    expect(Math.max(contrast(p['rule-strong'], image), contrast(p.card, image))).toBeGreaterThanOrEqual(3);
    expect(contrast(p.ink, p.card)).toBeGreaterThanOrEqual(4.5);
  });

  // The selected filmstrip frame: a 3 px ink outline on a 2 px paper gap. The ring clears 3:1 on the paper around it,
  // and against any thumbnail edge, white or black, the ring or its gap does (the dark theme's ink alone is ~1.2:1 on white).
  it.each(['#FFFFFF', '#000000'])('selected-frame outline holds on a %s thumbnail edge', (edge) => {
    expect(contrast(p.ink, p.paper)).toBeGreaterThanOrEqual(3);
    expect(Math.max(contrast(p.ink, edge), contrast(p.paper, edge))).toBeGreaterThanOrEqual(3);
  });

  it('magnitude ramp is monotone in lightness, moving away from the card', () => {
    const ls = (['mag-1', 'mag-2', 'mag-3', 'mag-4'] as const).map((t) => lightness(p[t]));
    const dir = theme === 'light' ? -1 : 1;
    for (let i = 1; i < ls.length; i++) expect(dir * (ls[i]! - ls[i - 1]!)).toBeGreaterThan(0.05);
  });
});

it.each(CVD)('dark band-safe fill variants stay apart, sim: %s', (kind) => {
  expect(deltaE(darkFillVariants.added, darkFillVariants.removed, kind)).toBeGreaterThanOrEqual(8);
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
