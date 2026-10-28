import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureToSnapshots, parseSampleFixture } from '../../core/fixture.ts';
import { buildTimeline } from '../../core/timeline.ts';
import wikipedia from '../../samples/wikipedia-internet-archive.json';
import { samples } from '../../samples/index.ts';
import { AXIS_Y, barHeight, deckLayout, monthYear } from './deck.ts';
import { HERO_OPTIONS, Hero } from './Hero.tsx';

const fixture = parseSampleFixture(wikipedia);
const captures = fixture.snapshots.map((s) => s.ts);
const changes = buildTimeline(fixture.url, fixtureToSnapshots(fixture)).entries.map((e) => ({ to: e.to, score: e.significance.score }));

describe('deckLayout', () => {
  it('matches the 1440 board: half-width cards stepping 8 px, the latest whole on the right, 551 px tall', () => {
    const d = deckLayout(captures, changes, 1200);
    expect([d.cardW, d.cardH, d.step, d.span, d.height]).toEqual([600, 375, 8, 600, 551]);
    expect(d.cards[0]).toMatchObject({ x: 0, y: 0 });
    expect(d.cards.at(-1)).toMatchObject({ x: 600, y: 8 * (captures.length - 1) });
    expect(d.axisTop).toBe(d.cards.at(-1)!.y + d.cardH + 8);
    // Left edges follow the dates: in time order, 25 Apr 2018 about a third along (board: 190.5 px).
    expect(d.cards.map((c) => c.x)).toEqual([...d.cards.map((c) => c.x)].sort((a, b) => a - b));
    expect(d.cards.find((c) => c.ts.startsWith('20180425'))!.x).toBeCloseTo(190.5, 0);
    expect(d.ticks.map((t) => t.year)).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(d.ticks[0]!.x).toBeCloseTo(16.2, 0);
  });

  it('matches the phone board: 240 px cards stepping 5 px, a tick every 5 years', () => {
    const d = deckLayout(captures, changes, 358);
    expect([d.cardW, d.cardH, d.step, d.span, d.height]).toEqual([240, 150, 5, 118, 287]);
    expect(d.ticks.map((t) => t.year)).toEqual([2015, 2020, 2025]);
  });

  it('draws one bar per meaningful change at its newer capture, 4 + sqrt(score) x 30 px tall (the board\'s bars)', () => {
    const d = deckLayout(captures, changes, 1200);
    expect(d.bars).toHaveLength(changes.length);
    expect(d.bars.every((b) => d.cards.some((c) => c.ts === b.ts && c.x === b.x))).toBe(true);
    expect([barHeight(0), barHeight(0.25), barHeight(1), barHeight(4)]).toEqual([4, 19, 34, 34]);
    expect(d.bars.map((b) => Math.round(b.h))).toEqual([18, 29, 29, 16, 18, 18, 21, 17, 17, 19, 27, 24, 14]);
    expect(Math.max(...d.bars.map((b) => b.h))).toBeLessThan(AXIS_Y);
  });

  it('captions dates as month and year', () => {
    expect(monthYear('20140910041746')).toBe('Sep 2014');
  });
});

describe('Hero', () => {
  const html = renderToStaticMarkup(<Hero samples={samples} onSample={() => {}} onUrl={() => {}} deck={fixture} onCapture={() => {}} />);

  it(`has the headline, the address field and an option for each of the first ${HERO_OPTIONS} samples, in that order`, () => {
    expect(html).toContain('<h1 id="intro-title">See how any web page changed over the years</h1>');
    expect(html).toMatch(/aria-label="Page address"[^>]*placeholder="whatwg.org\/faq"/);
    expect(html).toContain('Show its history');
    expect([...html.matchAll(/class="sample-opt" data-sample="([^"]+)"/g)].map((m) => m[1])).toEqual(samples.slice(0, HERO_OPTIONS).map((s) => s.id));
    expect(html.indexOf('Show its history')).toBeLessThan(html.indexOf('Or open a sample'));
  });

  it('captions the deck with its captures and span; the field has no menu on the hero', () => {
    expect(html).toContain(`The Wikipedia article on the Internet Archive, ${captures.length} captures from Sep 2014 to Feb 2026.`);
    expect(html).not.toContain('role="combobox"');
  });
});
