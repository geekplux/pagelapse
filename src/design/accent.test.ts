import { describe, expect, it } from 'vitest';
import { cssDecls } from './cssRules.ts';
import base from './base.css?raw';
import hero from './hero.css?raw';
import live from './live.css?raw';
import visual from './visual.css?raw';

// Sand is the neutral; cyan means Before / removed and amber means After / added / selected, each paired with a word,
// a symbol (− / +), a ring or a text style (docs/DESIGN.md).
const decls = Object.entries({ 'base.css': base, 'live.css': live, 'visual.css': visual, 'hero.css': hero }).flatMap(([f, css]) => cssDecls(f, css));
const using = (re: RegExp) => decls.filter((d) => re.test(d.value));
const outside = (re: RegExp, allowed: RegExp) => using(re).filter((d) => !allowed.test(d.selector)).map((d) => `${d.selector} { ${d.prop}: ${d.value} }`);

describe('colour roles', () => {
  it('cyan and amber appear only in the diff, the Before / After labels and word counts, the ribbon\'s pair and selected change, the selected row of Every change, and the deck\'s latest / lifted capture', () => {
    expect(outside(/--(cyan|amber)-/, /\.db|\bins\b|\bdel\b|\.cs-(when|plus|minus)|\.change\[aria-current="true"\] \.change-mag|\.vp-(label|side)|\.rb-(th\[data-side|cv\[data-side|bar\.is-sel|dot\.is-sel|start)|\.deck-(latest|dot|bar\.is-on)/)).toEqual([]);
  });

  it('every colour is a Radix token, the ground or a picture surface', () => {
    const vars = decls.flatMap((d) => [...d.value.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!));
    // --deck-from(-y) is the deck's deal offset (lengths): the exact names outside the shared non-colour prefixes.
    const colours = vars.filter((v) => !/^--deck-from(-y)?$/.test(v) && !/^--(space|fs|lh|track|line|radius|ease|dur|font|split|prev|k|d|c|op|details-h|shadow)(-|$)/.test(v));
    expect(colours.filter((v) => !/^--((sand|cyan|amber)-([1-9]|1[0-2])|bg|frame|divider(-edge|-ink)?|replay-bg)$/.test(v))).toEqual([]);
  });

  it('a solid sand-12 fill is only the primary action, the tooltips (ribbon, deck date) and the live run\'s progress', () => {
    const fills = decls.filter((d) => /^background(-color)?$/.test(d.prop) && /var\(--sand-12\)/.test(d.value));
    expect(fills.map((d) => d.selector).filter((s) => !/^\.btn-go$|^\.rb-tip$|^\.deck-date$|^\.live-bar i$/.test(s))).toEqual([]);
    expect(fills.some((d) => d.selector === '.btn-go')).toBe(true);
  });

  it('no raw colour literals outside tokens.css', () => {
    const raw = decls.filter((d) => /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|lab)\(|\b(white|black)\b/i.test(d.value));
    expect(raw.map((d) => `${d.file} ${d.selector}`)).toEqual([]);
  });
});
