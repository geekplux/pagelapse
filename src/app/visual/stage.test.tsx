import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseSampleFixture } from '../../core/fixture.ts';
import gitScm from '../../samples/git-scm.json';
import rustLang from '../../samples/rust-lang.json';
import { buildTimeline } from '../../core/timeline.ts';
import { fixtureToSnapshots } from '../../core/fixture.ts';
import wikipedia from '../../samples/wikipedia-internet-archive.json';
import { TimelineView } from '../TimelineView.tsx';
import { spanText } from '../SheetHead.tsx';

const fixture = parseSampleFixture(wikipedia);
const PAIR = '20240316020238-20250502083649';
const render = (q: { change?: string; at?: string; view?: string; overview?: boolean } = {}, f = fixture) =>
  renderToStaticMarkup(<TimelineView fixture={f} initialChange={q.change} initialAt={q.at} initialMode={q.view} overview={q.overview} onChange={() => {}} />);
const git = parseSampleFixture(gitScm);
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

  it('under the decade compare the ribbon keeps the latest change, not the featured one (Play then starts from the first capture)', () => {
    const latest = fixture.snapshots.at(-1)!.ts;
    const current = (html: string) => /<[^>]*class="rb-th[^"]*"[^>]*aria-current="true"[^>]*>/.exec(html)?.[0] ?? /<[^>]*aria-current="true"[^>]*class="rb-th[^"]*"[^>]*>/.exec(html)?.[0];
    expect(fixture.featured).not.toMatch(new RegExp(`-${latest}$`));
    expect(current(render({ overview: true }))).toContain(`data-ts="${latest}"`);
    expect(current(render())).toContain(`data-ts="${fixture.featured!.split('-')[1]}"`);
  });

  it('has Play, Previous / Next, the compare control and Copy link in one row', () => {
    const row = /<div class="controls">.*<\/div>/.exec(render({ change: PAIR }))![0];
    for (const want of ['data-play', 'aria-label="Previous change"', 'aria-label="Next change"', 'id="vp-modes"', 'Copy link']) expect(row).toContain(want);
  });
});

describe('stage captions', () => {
  it('says "Trivial edit" once in Single, on the picture tag; the caption keeps "Open capture"', () => {
    const html = render({ change: '20160114164816-20170607181950', at: '20180716160704', view: 'single' }, git);
    expect(text(html).match(/Trivial edit/g)).toHaveLength(1);
    expect(text(/<figcaption class="vp-cap">(.*?)<\/figcaption>/.exec(html)![1]!)).toBe('Open capture (opens in a new tab)');
  });

  it('tags a partial capture on the picture, so nothing under the stage depends on the pair', () => {
    const ts = git.snapshots.find((x) => x.shot?.status === 'partial')!.ts;
    const html = render({ at: ts, view: 'single' }, git);
    expect(/<div class="vp-mat">.*class="vp-badge" data-corner="before".*?Partial copy/.test(html)).toBe(true);
    expect(text(/<figcaption class="vp-cap">(.*?)<\/figcaption>/.exec(html)![1]!)).toBe('Open capture (opens in a new tab)');
  });
});

describe('a pair with no picture', () => {
  const rust = parseSampleFixture(rustLang);
  const ts = rust.snapshots.find((x) => !x.shot?.file)!.ts;
  const e = buildTimeline(rust.url, fixtureToSnapshots(rust)).entries.find((x) => x.to === ts || x.from === ts)!;

  it('Slider falls back to Single in the same footprint: the reason is a tag on the picture, nothing is added around it', () => {
    const html = render({ change: `${e.from}-${e.to}` }, rust);
    expect(html).toContain('data-mode="single"');
    expect(/<div class="vp-mat">.*◑ No picture of the (Before|After) capture/.test(html)).toBe(true);
    expect(html).toMatch(/<div class="sr-only" role="status"><p class="vp-note">Slider needs a picture of both captures/);
    expect(html).not.toContain('<figcaption class="vp-cap">');
    expect(html).not.toContain('vp-sides');
  });

  it('Side by side keeps both mats, one with the "No picture" card', () => {
    const html = render({ change: `${e.from}-${e.to}`, view: 'side' }, rust);
    expect(html).toContain('data-mode="side"');
    expect(html.match(/class="vp-fig"/g)).toHaveLength(2);
    expect(html).toContain('No picture of this capture');
  });
});

describe('spanText', () => {
  it('names the first and last month, or one month', () => {
    expect(spanText(['20140910041746', '20260210000000'])).toBe('Sep 2014 to Feb 2026');
    expect(spanText(['20140910041746', '20140920041746'])).toBe('Sep 2014');
  });
});
