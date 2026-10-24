import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseSampleFixture } from '../../core/fixture.ts';
import wikipedia from '../../samples/wikipedia-internet-archive.json';
import { TimelineView } from '../TimelineView.tsx';
import { spanText } from '../SheetHead.tsx';

const fixture = parseSampleFixture(wikipedia);
const PAIR = '20240316020238-20250502083649';
const render = (q: { change?: string; view?: string; overview?: boolean } = {}) =>
  renderToStaticMarkup(<TimelineView fixture={fixture} initialChange={q.change} initialMode={q.view} overview={q.overview} onChange={() => {}} />);
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"');
const radios = (html: string) => [...html.matchAll(/<input[^>]*name="vp-mode"[^>]*>/g)].map(([tag]) => ({ value: /value="(\w+)"/.exec(tag)?.[1], checked: tag.includes('checked') }));
const checked = (html: string) => radios(html).find((r) => r.checked)?.value;

describe('workspace stage', () => {
  it('a retired `view=onion` link opens Slider', () => {
    const html = render({ change: PAIR, view: 'onion' });
    expect(checked(html)).toBe('slider');
    expect(html).toContain('data-mode="slider"');
    expect(html).toContain('role="slider"');
    expect(html).not.toMatch(/onion/i);
  });

  it('offers Slider, Side by side and Single, in that order', () => {
    const modes = radios(render({ change: PAIR })).map((r) => r.value);
    expect(modes).toEqual(['slider', 'side', 'single']);
  });

  it('titles the sample and gives the meta line without separators', () => {
    const html = render({ change: PAIR });
    const meta = text(/<p class="sheet-meta">(.*?)<\/p>/.exec(html)![1]!);
    expect(meta).toBe('14 captures' + 'Sep 2014 to Feb 2026' + '13 changes' + 'Sample');
    expect(html).toContain('<h2 id="sample-label">Wikipedia: Internet Archive</h2>');
    expect(html).not.toContain('·');
  });

  it('tags the pictures Before and After with ring and dot, word and date', () => {
    const tags = [...render({ change: PAIR }).matchAll(/<span class="vp-label" data-side="(\w+)"[^>]*>(.*?)<\/span><\/span>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(tags).toEqual([
      ['before', 'Before 16 Mar 2024'],
      ['after', 'After 2 May 2025'],
    ]);
  });

  it('says which change is shown, or "First and latest" for the decade compare', () => {
    expect(text(render({ change: PAIR }))).toContain('Change 11 of 13');
    const first = text(render({ overview: true }));
    expect(first).toContain('First and latest');
    expect(first).not.toContain('Change 13 of 13');
  });

  it('has Play, Previous / Next, the compare control and Copy link in one row', () => {
    const row = /<div class="controls">.*<\/div>/.exec(render({ change: PAIR }))![0];
    for (const want of ['data-play', 'aria-label="Previous change"', 'aria-label="Next change"', 'id="vp-modes"', 'Copy link']) expect(row).toContain(want);
  });
});

describe('spanText', () => {
  it('names the first and last month, or one month', () => {
    expect(spanText(['20140910041746', '20260210000000'])).toBe('Sep 2014 to Feb 2026');
    expect(spanText(['20140910041746', '20140920041746'])).toBe('Sep 2014');
  });
});
