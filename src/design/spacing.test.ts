import { describe, expect, it } from 'vitest';
import { cssDecls } from './cssRules.ts';
import base from './base.css?raw';
import live from './live.css?raw';
import tokens from './tokens.css?raw';
import visual from './visual.css?raw';

// D32: margins, paddings, gaps, insets and scroll paddings use only the --space-* scale (4/8/16/24/40/64 px).
const decls = Object.entries({ 'base.css': base, 'live.css': live, 'visual.css': visual }).flatMap(([f, css]) => cssDecls(f, css));
const SPACING = /^(margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|scroll-padding|scroll-margin)(-|$)/;
const INSET = /^(inset|top|right|bottom|left)/;
const TOKEN = /var\(--space-[1-6]\)/g;

/** `0`, `auto`, a token, or a calc() of tokens and plain multipliers (insets may also use percentages). */
function ok(prop: string, value: string): boolean {
  const v = value.replace(/\s*!important$/, '').replace(TOKEN, 'T');
  const atom = INSET.test(prop) ? String.raw`(?:0|auto|T|\d+(?:\.\d+)?%)` : '(?:0|auto|T)';
  const calc = String.raw`calc\([T\d.%\s+\-*/()]+\)`;
  return new RegExp(`^(?:(?:${atom}|${calc})\\s*)+$`).test(v) && !/\d(?:px|r?em|vw|vh)\b/.test(v);
}

describe('spacing scale', () => {
  it('tokens are exactly 4/8/16/24/40/64 px', () => {
    const scale = [...tokens.matchAll(/--space-(\d):\s*(\d+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(scale).toEqual([[1, 4], [2, 8], [3, 16], [4, 24], [5, 40], [6, 64]]);
  });

  it('every spacing value is a token (or an allowlisted, commented exception)', () => {
    const bad = decls.filter((d) => SPACING.test(d.prop) && !d.allowed && !ok(d.prop, d.value));
    expect(bad.map((d) => `${d.file} ${d.selector} { ${d.prop}: ${d.value} }`)).toEqual([]);
  });

  it('has at most 6 allowlist entries', () => {
    expect(decls.filter((d) => d.allowed).length).toBeLessThanOrEqual(6);
  });

  it('rejects raw lengths (the check is not vacuous)', () => {
    expect(ok('margin', '0.5rem')).toBe(false);
    expect(ok('padding', 'var(--space-2) 3px')).toBe(false);
    expect(ok('gap', 'calc(var(--space-2) + 1px)')).toBe(false);
    expect(ok('top', 'calc(-1 * var(--space-3))')).toBe(true);
    expect(ok('top', 'calc(100% + var(--space-1))')).toBe(true);
    expect(ok('margin', '50%')).toBe(false);
  });
});
