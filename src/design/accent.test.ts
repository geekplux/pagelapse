import { describe, expect, it } from 'vitest';
import { cssDecls } from './cssRules.ts';
import base from './base.css?raw';
import hero from './hero.css?raw';
import live from './live.css?raw';
import visual from './visual.css?raw';

// Sand is the neutral; cyan means Before / removed and amber means After / added / selected, each paired with a word,
// a symbol (− / +), a ring or a text style (docs/redesign/DESIGN.md).
const decls = Object.entries({ 'base.css': base, 'live.css': live, 'visual.css': visual, 'hero.css': hero }).flatMap(([f, css]) => cssDecls(f, css));
const using = (re: RegExp) => decls.filter((d) => re.test(d.value));
const outside = (re: RegExp, allowed: RegExp) => using(re).filter((d) => !allowed.test(d.selector)).map((d) => `${d.selector} { ${d.prop}: ${d.value} }`);

describe('colour roles', () => {
  it('cyan and amber appear only in the diff, the Before / After labels, the selected change and the deck\'s latest / lifted capture', () => {
    expect(outside(/--(cyan|amber)-/, /\.db|\.diff-|\bins\b|\bdel\b|\.w-(ins|del)|\.vp-(label|side)|\.tl-(ring|caret|stem\.is-sel)|\.deck-(latest|dot|bar\.is-on)/)).toEqual([]);
  });

  it('every colour is a Radix token, the ground or a picture surface', () => {
    const vars = decls.flatMap((d) => [...d.value.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!));
    // --deck-from is the deck's deal offset (a length): the one exact name outside the shared non-colour prefixes.
    const colours = vars.filter((v) => v !== '--deck-from' && !/^--(space|fs|lh|track|line|radius|ease|dur|font|split|prev|k|d|c|op|details-h|shadow)(-|$)/.test(v));
    expect(colours.filter((v) => !/^--((sand|cyan|amber)-([1-9]|1[0-2])|bg|frame|divider(-edge|-ink)?|replay-bg)$/.test(v))).toEqual([]);
  });

  it('a solid sand-12 fill is only the primary action, the tooltips (timeline, deck date) and a pressed toggle', () => {
    const fills = decls.filter((d) => /^background(-color)?$/.test(d.prop) && /var\(--sand-12\)/.test(d.value));
    expect(fills.map((d) => d.selector).filter((s) => !/^\.btn-go$|^\.tl-tip$|^\.deck-date$|progress/.test(s))).toEqual([]);
    expect(fills.some((d) => d.selector === '.btn-go')).toBe(true);
  });

  it('no raw colour literals outside tokens.css', () => {
    const raw = decls.filter((d) => /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|lab)\(|\b(white|black)\b/i.test(d.value));
    expect(raw.map((d) => `${d.file} ${d.selector}`)).toEqual([]);
  });
});
