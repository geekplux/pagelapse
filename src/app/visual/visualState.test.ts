import { describe, expect, it } from 'vitest';
import { captureForChange, changeForCapture, frameNo, initialView, shotSrc, sideOf, viewQuery } from './visualState.ts';

const caps = ['2013', '2014', '2015', '2016', '2017'].map((y) => `${y}0101000000`);
// 2015 is a trivial capture: the 2014 -> 2016 change skips it.
const entries = [
  { from: caps[0]!, to: caps[1]! },
  { from: caps[1]!, to: caps[3]! },
  { from: caps[3]!, to: caps[4]! },
];

describe('visualState', () => {
  it('maps a change to its captures and back', () => {
    expect(captureForChange(entries[1]!, 'before')).toBe(caps[1]);
    expect(captureForChange(entries[1]!, 'after')).toBe(caps[3]);
    expect(sideOf(entries[1]!, caps[1]!)).toBe('before');
    expect(sideOf(entries[1]!, caps[3]!)).toBe('after');
    expect(sideOf(entries[1]!, caps[2]!)).toBeNull();
  });

  it('finds the change in effect at a capture, including trivial ones', () => {
    expect(changeForCapture(entries, caps[0]!)).toBe(0);
    expect(changeForCapture(entries, caps[1]!)).toBe(0);
    expect(changeForCapture(entries, caps[2]!)).toBe(0);
    expect(changeForCapture(entries, caps[3]!)).toBe(1);
    expect(changeForCapture(entries, caps[4]!)).toBe(2);
    expect(changeForCapture([], caps[0]!)).toBe(-1);
  });

  it('opens on the deep link, then the capture, then the featured change, then the latest', () => {
    const featured = `${caps[1]}-${caps[3]}`;
    expect(initialView(entries, caps, { featured })).toEqual({ index: 1, at: caps[3] });
    expect(initialView(entries, caps, { change: `${caps[0]}-${caps[1]}`, featured })).toEqual({ index: 0, at: caps[1] });
    expect(initialView(entries, caps, { change: 'bogus', at: caps[2], featured })).toEqual({ index: 0, at: caps[2] });
    expect(initialView(entries, caps, { change: 'bogus', at: '20990101000000', featured })).toEqual({ index: 1, at: caps[3] });
    expect(initialView(entries, caps, {})).toEqual({ index: 2, at: caps[4] });
    expect(initialView([], caps, {})).toEqual({ index: -1, at: caps[4] });
  });

  it('keeps the default `at` out of the query', () => {
    expect(viewQuery(entries[1]!, caps[3]!)).toEqual({ change: `${caps[1]}-${caps[3]}`, at: undefined });
    expect(viewQuery(entries[1]!, caps[1]!)).toEqual({ change: `${caps[1]}-${caps[3]}`, at: caps[1] });
  });

  it('builds same-origin picture URLs and frame numbers', () => {
    expect(shotSrc('git-scm', '20131106090756-302c3cea')).toBe('/samples/git-scm/20131106090756-302c3cea.webp');
    expect(shotSrc('git-scm', '20131106090756-302c3cea', true)).toBe('/samples/git-scm/20131106090756-302c3cea.thumb.webp');
    expect(frameNo(0)).toBe('#01');
    expect(frameNo(13)).toBe('#14');
  });
});
