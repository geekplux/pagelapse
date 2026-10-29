import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { samples } from '../../samples/index.ts';
import { shareable } from '../live/api.ts';
import { ShareToGallery } from '../live/ShareToGallery.tsx';
import { ExploredCard, largest, years } from './ExploredCard.tsx';
import { Gallery } from './Gallery.tsx';
import { HERO_OPTIONS, Hero } from './Hero.tsx';

const noop = () => {};

describe('the gallery under the deck', () => {
  const out = renderToStaticMarkup(<Gallery samples={samples} onSample={noop} onUrl={noop} onExplored={noop} />);

  it('shows every sample as a card with host, years and captures; thumbnails wait until the gallery is in view', () => {
    expect(out.match(/class="g-card" data-sample=/g)).toHaveLength(samples.length);
    expect(out.match(/<span class="g-thumb"><\/span>/g)).toHaveLength(samples.length);
    expect(out).not.toContain('<img');
    expect(out).toContain('<span>nasa.gov</span>');
    expect(out).toMatch(/<span class="mono">\d{4} to \d{4}, \d+ captures<\/span>/);
  });

  it('waits to load Recently explored, and credits the Internet Archive', () => {
    expect(out).toContain('<h2 id="explored-title">Recently explored</h2>');
    expect(out).toContain('aria-busy="true">Loading…</p>');
    expect(out).toContain('<a href="https://web.archive.org/">Internet Archive’s Wayback Machine</a>');
  });

  it('years: one year, or a span', () => {
    expect(years('20090101000000', '20091201000000')).toBe('2009');
    expect(years('20090101000000', '20261201000000')).toBe('2009 to 2026');
  });
});

describe('a Recently explored card', () => {
  const entry = { url: 'https://example.org/', title: 'Example', captures: 16, firstTs: '19990101000000', lastTs: '20260101000000', added: 1 };

  it('leads with the title, then the address, then the years as a ticket with a dot per change', () => {
    const out = renderToStaticMarkup(<ExploredCard entry={{ ...entry, changes: [[0, 100], [500, 25], [1000, 100]] }} onUrl={() => {}} />);
    expect(out.indexOf('class="g-title">Example')).toBeLessThan(out.indexOf('class="g-addr">example.org'));
    expect(out.indexOf('class="g-addr"')).toBeLessThan(out.indexOf('class="g-ticket"'));
    expect(out).toContain('<span class="g-ticket" aria-hidden="true"><span class="mono">1999</span>');
    // A dot at each change's place; the largest (the latest of a tie) is marked.
    expect(out.match(/class="g-dot[^"]*" style="left:[\d.]+%"/g)).toEqual([
      'class="g-dot" style="left:0%"',
      'class="g-dot" style="left:50%"',
      'class="g-dot is-top" style="left:100%"',
    ]);
    expect(out).toContain('<span class="sr-only">1999 to 2026, 3 changes</span>');
    expect(out).toContain('href="?url=https%3A%2F%2Fexample.org%2F"');
  });

  it('an entry shared before changes were stored shows its years with a bare line, and counts captures', () => {
    const out = renderToStaticMarkup(<ExploredCard entry={entry} onUrl={() => {}} />);
    expect(out).toContain('<span class="g-line"></span>');
    expect(out).toContain('<span class="sr-only">1999 to 2026, 16 captures</span>');
  });

  it('largest: the highest score, the latest of a tie, none for no changes', () => {
    expect([largest([[0, 40], [10, 90], [20, 60]]), largest([[0, 90], [10, 90]]), largest([])]).toEqual([1, 1, -1]);
  });
});

describe('the hero', () => {
  it(`offers the first ${HERO_OPTIONS} samples, then "More pages" down to the gallery`, () => {
    const out = renderToStaticMarkup(<Hero samples={samples} onSample={noop} onUrl={noop} deck={undefined} onCapture={noop} onExplored={noop} />);
    expect(out.match(/class="sample-opt"/g)).toHaveLength(Math.min(HERO_OPTIONS, samples.length));
    expect(out).toContain('<a class="intro-more" href="#gallery">More pages</a>');
    expect(out).toContain('id="gallery"');
  });
});

describe('Add to Recently explored', () => {
  it('is a button until pressed; only plain addresses qualify', () => {
    expect(renderToStaticMarkup(<ShareToGallery url="https://example.org/" />)).toBe(
      '<span class="share"><button type="button" class="btn-link">Add to Recently explored</button></span>',
    );
    expect([shareable('https://example.org/a'), shareable('https://example.org/?id=1'), shareable('nope')]).toEqual([true, false, false]);
  });
});
