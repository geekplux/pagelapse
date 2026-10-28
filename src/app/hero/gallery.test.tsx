import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { samples } from '../../samples/index.ts';
import { shareable } from '../live/api.ts';
import { ShareToGallery } from '../live/ShareToGallery.tsx';
import { Gallery, years } from './Gallery.tsx';
import { HERO_OPTIONS, Hero } from './Hero.tsx';

const noop = () => {};

describe('the gallery under the deck', () => {
  const out = renderToStaticMarkup(<Gallery samples={samples} onSample={noop} onUrl={noop} />);

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

describe('the hero', () => {
  it(`offers the first ${HERO_OPTIONS} samples, then "More pages" down to the gallery`, () => {
    const out = renderToStaticMarkup(<Hero samples={samples} onSample={noop} onUrl={noop} deck={undefined} onCapture={noop} />);
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
