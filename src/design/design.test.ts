import { describe, expect, it } from 'vitest';
import { cssDecls } from './cssRules.ts';
import base from './base.css?raw';
import hero from './hero.css?raw';
import live from './live.css?raw';
import tokens from './tokens.css?raw';
import visual from './visual.css?raw';

// The binding UI rules of docs/redesign/DESIGN.md that a stylesheet can break: four font sizes, two families,
// 0.5px lines, the four radii, one curve and duration for motion, tabular figures only on numbers.
const decls = Object.entries({ 'base.css': base, 'live.css': live, 'visual.css': visual, 'hero.css': hero }).flatMap(([f, css]) => cssDecls(f, css));
const show = (ds: typeof decls) => ds.map((d) => `${d.file} ${d.selector} { ${d.prop}: ${d.value} }`);
/** Forced-colors overrides use system colours and may draw heavier lines: they are not part of the visual design. */
const designed = decls.filter((d) => !/\b(Canvas|CanvasText|Highlight|HighlightText|ButtonText|ButtonFace|GrayText)\b/.test(d.value));

describe('type', () => {
  it('has exactly four sizes: 12/16, 14/20, 20/28 and 40/48 px', () => {
    const px = (name: string) => 16 * Number(new RegExp(`--${name}:\\s*([\\d.]+)rem`).exec(tokens)?.[1]);
    expect([12, 14, 20, 40].map((n) => [px(`fs-${n}`), px(`lh-${n}`)])).toEqual([[12, 16], [14, 20], [20, 28], [40, 48]]);
  });

  it('every font size is one of the four tokens', () => {
    const size = designed.filter((d) => d.prop === 'font-size' || d.prop === 'font');
    // `.sr-comma` is a spoken-only comma at size 0: no visible type, so not a fifth size.
    const bad = size.filter((d) => d.value !== 'inherit' && !/var\(--fs-(12|14|20|40)\)/.test(d.value) && !(d.selector === '.sr-comma' && d.value === '0'));
    expect(show(bad)).toEqual([]);
    expect(size.length).toBeGreaterThan(20);
  });

  it('only the two self-hosted families', () => {
    const fams = designed.filter((d) => d.prop === 'font-family' || d.prop === 'font');
    const bad = fams.filter((d) => d.selector !== '@font-face' && d.value !== 'inherit' && !/var\(--font-(ui|mono)\)/.test(d.value));
    expect(show(bad)).toEqual([]);
    expect(tokens).toMatch(/--font-ui: "Schibsted Grotesk",/);
    expect(tokens).toMatch(/--font-mono: "IBM Plex Mono",/);
  });

  it('tabular figures only on numeric spans (.num), never on running text', () => {
    expect(show(designed.filter((d) => d.prop === 'font-variant-numeric' && d.selector !== '.num'))).toEqual([]);
  });

  it('the 40 px size is tracked -0.025em', () => {
    expect(tokens).toMatch(/--track-40: -0\.025em;/);
    expect(designed.filter((d) => /var\(--fs-40\)/.test(d.value)).every((d) => designed.some((e) => e.selector === d.selector && e.value === 'var(--track-40)'))).toBe(true);
  });
});

describe('lines and radii', () => {
  it('borders are 0.5px hairlines (graphic marks: the magnitude dots excepted)', () => {
    const borders = designed.filter((d) => /^border(-(top|right|bottom|left))?(-width)?$/.test(d.prop) && /[1-9]/.test(d.value));
    const bad = borders.filter((d) => !/var\(--line\)/.test(d.value) && !/\.change-mag/.test(d.selector));
    expect(show(bad)).toEqual([]);
    expect(tokens).toMatch(/--line: 0\.5px;/);
  });

  it('outlines are the 2px focus ring', () => {
    const bad = designed.filter((d) => /^outline(-width)?$/.test(d.prop) && d.value !== 'none' && !/^2px solid var\(--sand-12\)$/.test(d.value));
    expect(show(bad)).toEqual([]);
  });

  it('radii are 4, 6, 8 or 12 (circles and the 2 px progress bar excepted)', () => {
    const bad = designed.filter(
      (d) => d.prop === 'border-radius' && !/^(0|50%|var\(--radius-(4|6|8|12)\))$/.test(d.value) && !(/live-bar/.test(d.selector) && d.value === '1px'),
    );
    expect(show(bad)).toEqual([]);
  });
});

describe('motion', () => {
  it('every transition is ease-out, 250 ms', () => {
    expect(tokens).toMatch(/--ease: ease-out;/);
    expect(tokens).toMatch(/--dur: 250ms;/);
    const bad = designed.filter((d) => d.prop === 'transition' && d.value.split(/,(?![^(]*\))/).some((part) => !/var\(--dur\) var\(--ease\)/.test(part)));
    expect(show(bad)).toEqual([]);
  });

  it('every animation is ease-out, 250 ms (the 450 ms deal and the 150 ms menu excepted)', () => {
    expect(tokens).toMatch(/--dur-deal: 450ms;/);
    expect(tokens).toMatch(/--dur-menu: 150ms;/);
    const bad = designed.filter((d) => d.prop === 'animation' && !/var\(--dur(-deal|-menu)?\) var\(--ease\)/.test(d.value));
    expect(show(bad)).toEqual([]);
    expect(designed.filter((d) => /--dur-deal/.test(d.value)).map((d) => d.selector)).toEqual(['.is-dealing .deck-card']);
    expect(designed.filter((d) => /--dur-menu/.test(d.value)).map((d) => d.selector)).toEqual(['.addr-menu']);
  });

  it('Open runs 350 ms ease-out as a view transition; Play\'s playhead alone is linear, over the 1.2 s hold', () => {
    expect(tokens).toMatch(/--dur-open: 350ms;/);
    expect(tokens).toMatch(/--dur-play: 1200ms;/);
    const open = designed.filter((d) => /--dur-open/.test(d.value));
    expect(open.map((d) => `${d.selector} ${d.prop}`)).toEqual(['::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) animation-duration']);
    expect(designed.filter((d) => d.selector === open[0]!.selector && d.prop === 'animation-timing-function').map((d) => d.value)).toEqual(['var(--ease)']);
    // Longhands set nothing else: the playhead's linear slide is the one exception, pinned to its selector.
    const longhands = designed.filter((d) => /^(transition|animation)-(duration|timing-function)$/.test(d.prop) && !d.value.endsWith('!important') && d.selector !== open[0]!.selector);
    expect(longhands.map((d) => `${d.selector} ${d.prop}: ${d.value}`)).toEqual(['.rb[data-playing] :is(.rb-span, .rb-start) transition-duration: var(--dur-play)', '.rb[data-playing] :is(.rb-span, .rb-start) transition-timing-function: linear']);
  });

  it('reduced motion turns every animation and transition off', () => {
    expect(base).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{\s*animation-duration: 0s !important;[^}]*transition-duration: 0s !important;/);
    // The view transition too (openTransition.ts also skips it under reduce).
    expect(hero).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation-duration: 0s !important; \}/);
  });
});

describe('copy', () => {
  const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it('never uses the middle dot', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    expect(Object.entries(sources).filter(([, src]) => src.includes('·')).map(([file]) => file)).toEqual([]);
  });
});
