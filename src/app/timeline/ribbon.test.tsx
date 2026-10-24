import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureToSnapshots, parseSampleFixture } from '../../core/fixture.ts';
import { buildTimeline } from '../../core/timeline.ts';
import gitScm from '../../samples/git-scm.json';
import wikipedia from '../../samples/wikipedia-internet-archive.json';
import { TimelineView } from '../TimelineView.tsx';

const render = (f: ReturnType<typeof parseSampleFixture>, change?: string) =>
  renderToStaticMarkup(<TimelineView fixture={f} initialChange={change} onChange={() => {}} />);
const count = (html: string, re: RegExp) => [...html.matchAll(re)].length;

describe('time ribbon', () => {
  const wiki = parseSampleFixture(wikipedia);
  const PAIR = '20240316020238-20250502083649';
  const html = render(wiki, PAIR);

  it('has one thumbnail and one hairline per capture, a bar per change and a filled dot for the first capture', () => {
    const t = buildTimeline(wiki.url, fixtureToSnapshots(wiki));
    expect(count(html, /class="rb-th"/g)).toBe(wiki.snapshots.length);
    expect(count(html, /class="rb-cv"/g)).toBe(wiki.snapshots.length);
    expect(count(html, /class="rb-bar( is-sel)?"/g)).toBe(t.entries.length);
    expect(count(html, /class="rb-first"/g)).toBe(1);
    expect(html).toMatch(/<svg aria-hidden="true"/);
  });

  it('rings the pair (Before, After in the thumbnail names too), colours their hairlines and the selected bar', () => {
    expect(html).toMatch(/data-ts="20240316020238" data-side="before"[^>]*aria-label="Capture 11 of 14, 16 March 2024, Before"/);
    expect(html).toMatch(/data-ts="20250502083649" data-side="after"[^>]*aria-label="Capture 12 of 14, 2 May 2025, After"[^>]*aria-current="true"/);
    expect(count(html, /class="rb-cv" data-side="(before|after)"/g)).toBe(2);
    expect(count(html, /class="rb-bar is-sel"/g)).toBe(1);
    expect(html).toContain('class="rb-span"');
    expect(html).toContain('class="rb-start"');
  });

  it('is a keyboard slider over the changes with the change as its value text', () => {
    expect(html).toMatch(/role="slider" tabindex="0" aria-labelledby="timeline-heading" aria-describedby="rb-hint"[^>]*aria-valuenow="11"[^>]*aria-valuetext="Change 11 of 13: 16 March 2024 to 2 May 2025/);
    // The thumbnails are one tab stop.
    expect(count(html, /class="rb-th"[^>]*tabindex="0"/g)).toBe(1);
  });

  it('draws trivial captures as hollow dots, says so in their names and offers to show them', () => {
    const git = parseSampleFixture(gitScm);
    const t = buildTimeline(git.url, fixtureToSnapshots(git));
    expect(t.trivialCaptures.length).toBeGreaterThan(0);
    const out = render(git);
    expect(count(out, /class="rb-dot"/g)).toBe(t.trivialCaptures.length);
    expect(count(out, /data-trivial="true"[^>]*aria-label="[^"]*trivial edit/g)).toBe(t.trivialCaptures.length);
    expect(out).toContain(`${t.trivialCaptures.length} ${t.trivialCaptures.length === 1 ? 'capture' : 'captures'} only changed dates or counters.`);
    expect(out).toContain('Show them');
  });
});
