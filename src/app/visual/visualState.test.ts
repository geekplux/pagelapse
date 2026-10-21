import { describe, expect, it } from 'vitest';
import { captureForChange, changeForCapture, frameNo, initialView, parseMode, shotAlt, shotSrc, showingText, sideOf, splitFromKey, splitFromPointer, splitText, viewQuery } from './visualState.ts';

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
    expect(viewQuery(entries[1]!, caps[3]!)).toEqual({ change: `${caps[1]}-${caps[3]}`, at: undefined, view: undefined });
    expect(viewQuery(entries[1]!, caps[1]!, 'onion')).toEqual({ change: `${caps[1]}-${caps[3]}`, at: caps[1], view: 'onion' });
    expect(viewQuery(entries[1]!, caps[3]!, 'slider').view).toBeUndefined();
  });

  it('parses compare modes', () => {
    expect(['single', 'side', 'slider', 'onion', 'zoom', undefined].map((v) => parseMode(v))).toEqual(['single', 'side', 'slider', 'onion', undefined, undefined]);
  });

  it('moves the divider by key: ±5, ±25 by page, Home/End, Enter resets; clamped to 0-100', () => {
    const keys = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Enter', 'Tab'];
    expect(keys.map((k) => splitFromKey(k, 40))).toEqual([35, 35, 45, 45, 15, 65, 0, 100, 50, null]);
    expect(splitFromKey('ArrowLeft', 2)).toBe(0);
    expect(splitFromKey('PageUp', 90)).toBe(100);
  });

  it('moves the divider to the pointer, clamped to the box', () => {
    expect(splitFromPointer(150, 100, 200)).toBe(25);
    expect(splitFromPointer(50, 100, 200)).toBe(0);
    expect(splitFromPointer(400, 100, 200)).toBe(100);
    expect(splitFromPointer(10, 0, 0)).toBe(50);
  });

  it('says how much of each side the slider shows', () => {
    expect(splitText(40, { from: '20131106090756', to: '20251218000000' })).toBe('40% before (November 2013), 60% after (December 2025)');
    expect(splitText(100, { from: '20250404000000', to: '20251218000000' })).toBe('100% before (April 2025), 0% after (December 2025)');
  });

  it('builds same-origin picture URLs and frame numbers', () => {
    expect(shotSrc('git-scm', '20131106090756-302c3cea')).toBe('/samples/git-scm/20131106090756-302c3cea.webp');
    expect(shotSrc('git-scm', '20131106090756-302c3cea', true)).toBe('/samples/git-scm/20131106090756-302c3cea.thumb.webp');
    expect(frameNo(0)).toBe('#01');
    expect(frameNo(13)).toBe('#14');
  });

  it('says which capture is shown, naming the side or the frame', () => {
    expect(showingText(caps, entries[1]!, caps[1]!, false)).toBe('Before, 1 January 2014');
    expect(showingText(caps, entries[1]!, caps[3]!, false)).toBe('After, 1 January 2016');
    expect(showingText(caps, entries[1]!, caps[2]!, true)).toBe('capture #03, 1 January 2015, trivial edit');
    expect(showingText(caps, entries[1]!, caps[2]!, false)).toBe('capture #03, 1 January 2015');
  });

  it('names the side in the alt text', () => {
    expect(shotAlt('x.org home page', entries[1]!, caps[3]!)).toBe('x.org home page as captured 1 January 2016 (After), top of page');
    expect(shotAlt('x.org home page', entries[1]!, caps[1]!)).toBe('x.org home page as captured 1 January 2014 (Before), top of page');
    expect(shotAlt('x.org home page', entries[1]!, caps[2]!)).toBe('x.org home page as captured 1 January 2015, top of page');
  });
});
