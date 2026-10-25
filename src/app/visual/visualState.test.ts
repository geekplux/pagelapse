import { describe, expect, it } from 'vitest';
import { DEFAULT_MODE, MODES, captureForChange, changeForCapture, firstCaptures, frameNo, initialView, opensOnDecade, overviewPair, parseMode, shotAlt, shotSrc, showingText, sideOf, splitFromKey, splitFromPointer, splitText, viewQuery } from './visualState.ts';

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
    expect(viewQuery(entries[1]!, caps[1]!, 'side')).toEqual({ change: `${caps[1]}-${caps[3]}`, at: caps[1], view: 'side' });
    expect(viewQuery(entries[1]!, caps[3]!, 'slider').view).toBeUndefined();
    expect(viewQuery(entries[1]!, caps[3]!, 'slider', 'single').view).toBe('slider');
    expect(viewQuery(entries[1]!, caps[3]!, 'single', 'single').view).toBeUndefined();
  });

  it('parses compare modes; the retired onion skin is unknown, so a `view=onion` link opens Slider', () => {
    expect(['single', 'side', 'slider', 'onion', 'zoom', undefined].map((v) => parseMode(v))).toEqual(['single', 'side', 'slider', undefined, undefined, undefined]);
    expect(parseMode('onion') ?? DEFAULT_MODE).toBe('slider');
  });

  it('lists the modes in the segmented control\'s order: Slider, Side by side, Single', () => {
    expect(MODES.map(([, label]) => label)).toEqual(['Slider', 'Side by side', 'Single']);
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
    // 1:1 with the pointer: one pixel of a 1200 px stage is not rounded to a whole percent.
    expect(splitFromPointer(601, 0, 1200)).toBe(50.1);
  });

  it('says how much of each side the slider shows', () => {
    expect(splitText(40, { from: '20131106090756', to: '20251218000000' })).toBe('40% before (November 2013), 60% after (December 2025)');
    expect(splitText(50.1, { from: '20131106090756', to: '20251218000000' })).toBe('50% before (November 2013), 50% after (December 2025)');
    expect(splitText(100, { from: '20250404000000', to: '20251218000000' })).toBe('100% before (April 2025), 0% after (December 2025)');
  });

  it('builds same-origin picture URLs and frame numbers', () => {
    expect(shotSrc('nasa', '19970605230559-47f6dc29')).toBe('/samples/nasa/19970605230559-47f6dc29.webp');
    expect(shotSrc('nasa', '19970605230559-47f6dc29', true)).toBe('/samples/nasa/19970605230559-47f6dc29.thumb.webp');
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

  it('spans the earliest complete capture to the latest one for the decade compare', () => {
    const shot = (status: 'ok' | 'partial' | 'failed') => ({ status, settle: 'quiet' as const, ...(status !== 'failed' && { file: 'x' }) });
    const snaps = [
      { ts: caps[0]!, shot: shot('failed') },
      { ts: caps[1]!, shot: shot('partial') },
      { ts: caps[2]!, shot: shot('ok') },
      { ts: caps[3]!, shot: shot('ok') },
      { ts: caps[4]!, shot: shot('partial') },
    ];
    expect(overviewPair(snaps)).toEqual({ from: caps[2], to: caps[3], skipped: 2 });
    expect(overviewPair(snaps.map((s) => ({ ...s, shot: shot('ok') })))).toEqual({ from: caps[0], to: caps[4], skipped: 0 });
    expect(overviewPair(snaps.slice(0, 3))).toBeUndefined();
    expect(overviewPair([])).toBeUndefined();
  });

  it('opens the default sample on its decade compare only when the address names no change, capture or Single', () => {
    expect(opensOnDecade(true, {})).toBe(true);
    expect(opensOnDecade(true, { view: 'side' })).toBe(true);
    expect(opensOnDecade(true, { view: 'single' })).toBe(false);
    expect(opensOnDecade(true, { change: 'a-b' })).toBe(false);
    expect(opensOnDecade(true, { at: caps[1] })).toBe(false);
    expect(opensOnDecade(false, {})).toBe(false);
  });

  it('names the pictures the workspace shows first, without the timeline', () => {
    const ok = { status: 'ok' as const, settle: 'quiet' as const, file: 'x' };
    const f = { snapshots: caps.map((ts) => ({ ts, shot: ok })), featured: `${caps[1]}-${caps[3]}` };
    expect(firstCaptures(f, {}, true)).toEqual([caps[0], caps[4]]);
    expect(firstCaptures(f, { view: 'single' }, true)).toEqual([caps[3]]);
    expect(firstCaptures(f, { view: 'side' }, false)).toEqual([caps[1], caps[3]]);
    expect(firstCaptures(f, { change: `${caps[3]}-${caps[4]}` }, true)).toEqual([caps[3], caps[4]]);
    expect(firstCaptures(f, { at: caps[2], view: 'single' }, true)).toEqual([caps[2]]);
    expect(firstCaptures(f, { at: caps[2] }, true)).toEqual([caps[2]]);
    expect(firstCaptures({ snapshots: f.snapshots }, { view: 'single' }, false)).toEqual([caps[4]]);
  });
});
