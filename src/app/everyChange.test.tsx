import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChangeRecord, TimelineEntry } from '../core/types.ts';
import { shownSummary } from './describe.ts';
import { EveryChange, mixedSources } from './EveryChange.tsx';

const record = (headingsAdded: string[], extra: Partial<ChangeRecord> = {}): ChangeRecord => ({
  pair: 'p', title: 't', headingsAdded, headingsRemoved: [], added: [], removed: [], modified: [],
  stats: { wordsAdded: 3, wordsRemoved: 1, blocksAdded: 1, blocksRemoved: 0, blocksModified: 0 }, ...extra,
});
const entry = (to: string, ai?: string, magnitude: TimelineEntry['significance']['magnitude'] = 'minor') =>
  ({ from: `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`, to, record: record([to.slice(0, 4)]), aiSummary: ai, significance: { magnitude, score: 0.2, reasons: [] } }) as unknown as TimelineEntry;

describe('EveryChange (one row per change, newest first)', () => {
  const html = (entries: TimelineEntry[], selected = 0, trivial = 0) =>
    renderToStaticMarkup(<EveryChange entries={entries} selected={selected} onSelect={() => {}} trivial={trivial} showTrivial={false} onTrivial={() => {}} />);

  it('lists newest first, marks the selected change, and says month ranges with long dates for screen readers', () => {
    const out = html([entry('20200301000000'), entry('20220601000000', undefined, 'major')], 0);
    expect(out.indexOf('“2022”')).toBeLessThan(out.indexOf('“2020”'));
    expect(out.match(/aria-current="true"[^]*?<\/button>/)?.[0]).toContain('“2020”');
    expect(out).toContain('<span aria-hidden="true">Mar 2019</span><span class="sr-only">1 March 2019</span>');
    expect(out).toContain('major');
    // The comma is clipped in place, so the name reads "minor, Added …"; the list itself is unnamed (the region is "Every change").
    expect(out).toContain('minor<span class="sr-comma">,</span></span></span><span class="change-sum">Added section “2020”');
    expect(out).toMatch(/<ol class="changes" role="list">/);
  });

  it('tags AI lines only in a list that mixes sources', () => {
    expect(mixedSources([entry('20200301000000'), entry('20210301000000')])).toBe(false);
    expect(mixedSources([entry('20200301000000', 'a'), entry('20210301000000', 'b')])).toBe(false);
    expect(mixedSources([entry('20200301000000', 'a'), entry('20210301000000')])).toBe(true);
    expect(html([entry('20200301000000', 'An AI line'), entry('20210301000000')])).toContain('An AI line <span class="tag">AI summary</span>');
    expect(html([entry('20200301000000', 'An AI line')])).not.toContain('class="tag"');
  });

  it('ends with the trivial captures and Show them (alone, without the table, when nothing changed), and is gone when there is nothing to list', () => {
    expect(html([entry('20200301000000')], 0, 3)).toMatch(/3 captures only changed dates or counters\. <button[^>]*>Show them<\/button>/);
    expect(html([], 0, 1)).toContain('1 capture only changed dates or counters.');
    expect(html([], 0, 1)).not.toContain('Every change');
    expect(html([], 0, 0)).toBe('');
  });
});

describe('shownSummary', () => {
  it('curls only the quotes around names and drops the word counts from rule summaries; AI lines stay as written', () => {
    expect(shownSummary({ record: record(['Downloads']) })).toBe('Added section “Downloads”');
    expect(shownSummary({ record: record([], { headingsRenamed: [['A', 'B c']] }) })).toBe('Renamed section “A” to “B c”');
    // A name with straight quotes of its own keeps them; only the marks around it are curly.
    expect(shownSummary({ record: record(['The "Wayback" Machine']) })).toBe('Added section “The "Wayback" Machine”');
    expect(shownSummary({ record: record([], { stats: { wordsAdded: 0, wordsRemoved: 0, blocksAdded: 0, blocksRemoved: 0, blocksModified: 0 } }) })).toBe('Moved content around');
    expect(shownSummary({ record: record(['x']), aiSummary: 'Said "so" (+1 / −1 words)' })).toBe('Said "so" (+1 / −1 words)');
  });
});
