import { describe, expect, it } from 'vitest';
import { cssDecls } from './cssRules.ts';
import base from './base.css?raw';
import live from './live.css?raw';
import visual from './visual.css?raw';

// D33: one accent (ink). Hues are data encodings only, each paired with a symbol or a word.
const decls = Object.entries({ 'base.css': base, 'live.css': live, 'visual.css': visual }).flatMap(([f, css]) => cssDecls(f, css));
const using = (re: RegExp) => decls.filter((d) => re.test(d.value));
const outside = (re: RegExp, allowed: RegExp) => using(re).filter((d) => !allowed.test(d.selector)).map((d) => `${d.selector} { ${d.prop}: ${d.value} }`);

describe('one accent', () => {
  it('added / removed hues appear only in the diff, the Before / After labels and the logo', () => {
    expect(outside(/--(added|removed)/, /\.db|\.diff-|\bins\b|\bdel\b|\.w-(ins|del)|\.vp-(label|side)|\.logo-/)).toEqual([]);
  });

  it('the magnitude ramp appears only on the timeline and its key', () => {
    expect(outside(/--mag-/, /\.tl-|\.mag-|\[data-magnitude|\.change-mag/)).toEqual([]);
  });

  it('a solid ink fill is only the primary action, the logo, and the picture divider', () => {
    const fills = decls.filter((d) => /^background(-color)?$/.test(d.prop) && /var\(--(ink|accent)\)/.test(d.value));
    expect(fills.map((d) => d.selector).filter((s) => !/^\.btn-go$|\.wm-frames|\.vp-split/.test(s))).toEqual([]);
    expect(fills.some((d) => d.selector === '.btn-go')).toBe(true);
  });

  it('no raw colour literals outside tokens.css', () => {
    const raw = decls.filter((d) => /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|lab)\(|\b(white|black)\b/i.test(d.value));
    expect(raw.map((d) => `${d.file} ${d.selector}`)).toEqual([]);
  });
});
