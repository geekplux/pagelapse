import { describe, expect, it } from 'vitest';
import { changeIndex, formatUrlState, parseUrlState } from './urlState.ts';
import type { TimelineEntry } from '../core/types.ts';
import { describeChange } from './describe.ts';

const entries = [
  { from: '20140101000000', to: '20150101000000' },
  { from: '20150101000000', to: '20160101000000' },
];

describe('urlState', () => {
  it('round-trips sample, change, at and view', () => {
    const s = { sample: 'git-scm', change: '20140101000000-20150101000000', at: '20140101000000', view: 'onion' };
    expect(parseUrlState(formatUrlState(s))).toEqual(s);
    expect(formatUrlState(s)).toBe('?sample=git-scm&change=20140101000000-20150101000000&at=20140101000000&view=onion');
    expect(parseUrlState('')).toEqual({ sample: undefined, url: undefined, change: undefined, at: undefined, view: undefined });
    expect(formatUrlState({})).toBe('');
  });
  it('round-trips a live run with its change', () => {
    const s = { url: 'https://example.org/a?b=1', change: '20140101000000-20150101000000' };
    expect(formatUrlState(s)).toBe('?url=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1&change=20140101000000-20150101000000');
    expect(parseUrlState(formatUrlState(s))).toMatchObject(s);
  });
  it('resolves a change pair, falling back to the latest entry', () => {
    expect(changeIndex(entries, '20140101000000-20150101000000')).toBe(0);
    expect(changeIndex(entries, 'bogus')).toBe(1);
    expect(changeIndex(entries)).toBe(1);
    expect(changeIndex([], 'x')).toBe(-1);
  });
});

describe('describeChange', () => {
  it('reads like the slider valuetext in AC 22', () => {
    const e = { ...entries[0]!, significance: { magnitude: 'major' }, ruleSummary: 'Added section "Downloads"' } as unknown as TimelineEntry;
    expect(describeChange(e, 3, 11)).toBe('Change 4 of 11: 1 January 2014 to 1 January 2015, major: Added section "Downloads"');
  });
});
