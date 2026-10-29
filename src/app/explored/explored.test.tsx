import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExploredPage } from './ExploredPage.tsx';

describe('the explored list (?explored)', () => {
  const out = renderToStaticMarkup(<ExploredPage onUrl={() => {}} />);

  it('has its title, focusable from script, and a lede', () => {
    expect(out).toContain('<h1 id="explored-page-title" tabindex="-1">Recently explored</h1>');
    expect(out).toContain('Every page visitors looked up and chose to share, newest first.');
  });

  it('loads its first page after mounting, and credits the Internet Archive', () => {
    expect(out).toContain('aria-busy="true">Loading…</p>');
    expect(out).toContain('<a href="https://web.archive.org/">Internet Archive’s Wayback Machine</a>');
  });
});
