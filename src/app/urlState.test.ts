import { describe, expect, it } from 'vitest';
import { changeIndex, formatUrlState, isHeroState, parseUrlState } from './urlState.ts';
import type { TimelineEntry } from '../core/types.ts';
import { describeChange } from './describe.ts';

const entries = [
  { from: '20140101000000', to: '20150101000000' },
  { from: '20150101000000', to: '20160101000000' },
];

describe('urlState', () => {
  it('round-trips sample, change, at and view', () => {
    const s = { sample: 'nasa', change: '20140101000000-20150101000000', at: '20140101000000', view: 'onion' };
    expect(parseUrlState(formatUrlState(s))).toEqual(s);
    expect(formatUrlState(s)).toBe('?sample=nasa&change=20140101000000-20150101000000&at=20140101000000&view=onion');
    expect(parseUrlState('')).toEqual({ sample: undefined, url: undefined, change: undefined, at: undefined, view: undefined });
    expect(formatUrlState({})).toBe('');
  });
  it('round-trips a live run with its change', () => {
    const s = { url: 'https://example.org/a?b=1', change: '20140101000000-20150101000000' };
    expect(formatUrlState(s)).toBe('?url=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1&change=20140101000000-20150101000000');
    expect(parseUrlState(formatUrlState(s))).toMatchObject(s);
  });
  it('shows the hero only when the address names no sample and no page', () => {
    expect(isHeroState(parseUrlState(''))).toBe(true);
    expect(isHeroState(parseUrlState('?change=20140101000000-20150101000000&view=side'))).toBe(true);
    expect(isHeroState(parseUrlState('?sample=wikipedia-internet-archive&at=20140910041746'))).toBe(false);
    expect(isHeroState(parseUrlState('?sample=nope'))).toBe(false);
    expect(isHeroState(parseUrlState('?url=example.org'))).toBe(false);
  });
  it('resolves a change pair, falling back to the latest entry', () => {
    expect(changeIndex(entries, '20140101000000-20150101000000')).toBe(0);
    expect(changeIndex(entries, 'bogus')).toBe(1);
    expect(changeIndex(entries)).toBe(1);
    expect(changeIndex([], 'x')).toBe(-1);
  });
  it('follows a change a live run has since split: to the part that ends at its After', () => {
    const split = [
      { from: '20100101000000', to: '20150101000000' },
      { from: '20150101000000', to: '20200101000000' },
      { from: '20200101000000', to: '20250101000000' },
    ];
    expect(changeIndex(split, '20100101000000-20200101000000')).toBe(1);
    expect(changeIndex(split, '20150101000000-20250101000000')).toBe(2);
  });
});

describe('describeChange', () => {
  it('reads like the slider valuetext', () => {
    const e = { ...entries[0]!, significance: { magnitude: 'major' }, ruleSummary: 'Added section "Downloads"' } as unknown as TimelineEntry;
    expect(describeChange(e, 3, 11)).toBe('Change 4 of 11: 1 January 2014 to 1 January 2015, major: Added section "Downloads"');
  });
});
