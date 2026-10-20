import { describe, expect, it } from 'vitest';
import { EXTRACTOR_VERSION, extractPage } from './extract.ts';
import { deriveOutline } from './outline.ts';
import type { BlockKind, ExtractedPage, OutlineNode } from './types.ts';

const DIR = '../../test/fixtures/html/';
const FIXTURES = import.meta.glob<string>('../../test/fixtures/html/*.html', { query: '?raw', import: 'default', eager: true });
const extract = (name: string) => extractPage(FIXTURES[`${DIR}${name}.html`]!);

const TAG: Record<BlockKind, string> = { heading: 'h', paragraph: 'p', 'list-item': 'li', quote: 'q', code: 'code', 'table-row': 'tr' };
/** One line per block (`h2 History`, `li Item`, `tr a | b`), so expected output stays reviewable. */
const render = (p: ExtractedPage) =>
  [`title: ${p.title}`, ...p.blocks.map((b) => `${TAG[b.kind]}${b.level ?? ''} ${b.text}`)].join('\n');
/** Text that sits in nav, footer, script, hidden or toolbar markup of the fixtures. */
const NOISE =
  /Jump to|Main page|Random article|Search|edit\]|Contents|navigation box|Categories|last edited|Privacy|RLQ|Wayback Machine -|captures|Close|Skip to|Sign in|cookies|Tracking|Related posts|rights reserved|dataLayer|enable JavaScript|Filed under|analytics|injected/;
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('extractPage', () => {
  it('has a cache-busting version', () => expect(EXTRACTOR_VERSION).toBe(2));

  it('extracts a Wikipedia-like article', () => {
    expect(render(extract('wikipedia-article'))).toMatchInlineSnapshot(`
      "title: Internet Archive - Wikipedia
      h1 Internet Archive
      p Internet Archive
      tr Type of site | Digital library
      tr Founded | May 12, 1996
      tr Headquarters | San Francisco, California
      p The Internet Archive is an American non-profit organization founded in 1996 by Brewster Kahle. It runs a digital library of websites, books, audio recordings, videos, images and software, with the stated mission of providing "universal access to all knowledge".
      h2 History
      p Kahle founded the archive in May 1996, around the same time that he began the for-profit web crawling company Alexa Internet.
      h3 Early years
      p By late 1999 the organization expanded its collections beyond the web archive, beginning with the Prelinger Archives.
      h2 Wayback Machine
      q The Wayback Machine is a digital archive of the World Wide Web.
      li Launched to the public in 2001
      li Uses Heritrix crawlers"
    `);
  });

  it('extracts an old table-layout homepage', () => {
    expect(render(extract('table-layout-1998'))).toMatchInlineSnapshot(`
      "title: Northfield Amateur Astronomers - Home Page
      p Home Star Parties Photo Gallery
      p Welcome to the Northfield Amateur Astronomers!
      p We are a small club of backyard stargazers who meet on the first Friday of every month at the old observatory on Hill Road. Beginners are always welcome, and you do not need your own telescope to join us.
      p Our 10" Dobsonian is available to members on clear nights.
      p Bring warm clothes & a red flashlight!
      h3 Upcoming meetings
      tr Date | Topic
      tr March 6 | Comet Hale-Bopp viewing
      tr April 3 | Messier marathon
      p Last updated 02/14/98"
    `);
  });

  it('strips the Wayback toolbar remnant', () => {
    expect(render(extract('wayback-toolbar'))).toMatchInlineSnapshot(`
      "title: Field Notes: Spring Migration
      h1 Spring migration notes
      p The first barn swallows arrived over the reed beds on the morning of April 9, a week earlier than last year.
      p Warblers followed in waves, with most sightings along the river path between the two footbridges."
    `);
  });

  it('prefers <main> over noisy chrome', () => {
    expect(render(extract('main-noisy'))).toMatchInlineSnapshot(`
      "title: How we rebuilt the reading room | Riverside Library Blog
      h1 How we rebuilt the reading room
      p By the facilities team
      p After forty years of service, the reading room needed new lighting, quieter heating and step-free access from the street entrance.
      h2 What changed
      li Daylight-balanced lamps on every table
      li A ramp and automatic doors at the east entrance
      p The work took eleven months and the room stayed open for most of it.
      q It finally feels like a room you want to stay in.
      q A regular visitor
      code Opening hours: Mon-Fri 9:00-20:00"
    `);
  });

  it('keeps descriptive navs (with paragraphs) when there is no <main>, but not link menus', () => {
    expect(render(extract('content-in-nav'))).toMatchInlineSnapshot(`
      "title: Quillmark - plain-text notes that sync
      p Quillmark keeps your notes as plain text files and syncs them between devices. Every note stays readable in any editor, works offline, and can be searched, versioned and backed up with the tools you already use.
      h3 About
      li Why plain text outlives every note-taking app.
      h3 Learn
      li A short guide, keyboard shortcuts and a cheat sheet.
      h3 Install
      li Builds for desktop and mobile platforms.
      p Version 3.2 adds offline search."
    `);
  });

  it.each([
    ['drops even descriptive navs inside a long enough <main>', `<main><p>${words(60)}</p><nav><p>Related blurb</p></nav></main>`, false],
    ['includes link-only navs when the page has < 50 words without them', '<nav><a href="/a">Related one</a></nav><p>Tiny page.</p>', true],
    ['drops link-only navs when the rest has >= 50 words', `<nav><a href="/a">Related one</a></nav><p>${words(60)}</p>`, false],
  ])('%s', (_, body, related) => {
    expect(render(extractPage(`<body>${body}</body>`)).includes('Related')).toBe(related);
  });

  it('keeps already-decoded non-UTF-8 text', () => {
    expect(render(extract('latin1-charset'))).toMatchInlineSnapshot(`
      "title: Jardim Botânico – Visitas guiadas
      h1 Visitas guiadas ao Jardim Botânico
      p As visitas começam às 10h, junto à estufa principal. A participação é gratuita e não é necessária inscrição prévia.
      li Duração
      li Cerca de uma hora e meia
      li Ponto de encontro
      li Portão da Rua da Escola Politécnica
      p Copyright © 2003 Jardim Botânico de Lisboa"
    `);
  });

  it('survives empty and broken markup', () => {
    expect(extractPage('')).toEqual({ title: '', blocks: [] });
    expect(render(extract('broken'))).toMatchInlineSnapshot(`
      "title: Broken & unclosed
      p Unclosed paragraph with bold text
      p A div that never ends
      li Orphan list item
      li Stray cell"
    `);
  });

  it.each(Object.keys(FIXTURES))('%s: no boilerplate, deterministic, not truncated', (key) => {
    const page = extractPage(FIXTURES[key]!);
    expect(page.blocks.map((b) => b.text).join('\n')).not.toMatch(NOISE);
    expect(extractPage(FIXTURES[key]!)).toEqual(page);
    expect(page.truncated).toBeUndefined();
  });

  it.each([
    ['prefers <article> when there is no <main>', `<div>Outside teaser</div><article><p>${words(60)}</p></article>`, false],
    ['falls back to the body when <main> has < 50 words', '<main><p>Short main.</p></main><p>Outside text</p>', true],
  ])('%s', (_, body, outside) => {
    expect(render(extractPage(`<body>${body}</body>`)).includes('Outside')).toBe(outside);
  });

  it('caps blocks and characters with truncated: true', () => {
    const para = `<p>${'x'.repeat(399)}</p>`;
    const byChars = extractPage(para.repeat(100));
    expect(byChars.truncated).toBe(true);
    expect(byChars.blocks.reduce((n, b) => n + b.text.length, 0)).toBe(30_000);
    expect(extractPage('<p>a</p>'.repeat(10), { maxBlocks: 3 })).toMatchObject({ blocks: { length: 3 }, truncated: true });
  });

  it.each([
    ['50,000 unclosed <font> tags', `<body>${'<font size=2>word word '.repeat(50_000)}`],
    ['20,000 nested <div>s', '<div><p>text here</p>'.repeat(20_000)],
    ['deep inline markup in a table row', `<body><table><tr><td>${'<b>w '.repeat(30_000)}`],
  ])('extracts %s without throwing in < 200 ms', (_, html) => {
    const start = performance.now();
    const page = extractPage(html);
    expect(performance.now() - start).toBeLessThan(200);
    expect(page.truncated).toBe(true);
    expect(page.blocks.length).toBeGreaterThan(0);
    expect(extractPage(html)).toEqual(page);
  });

  it('extracts a 500 KB page in < 200 ms', () => {
    let html = '<html><head><title>Big</title></head><body><nav>menu</nav>';
    for (let i = 0; html.length < 500_000; i++) {
      html += `<div><h2>Section ${i}</h2><p>${words(40)}</p><ul><li>a ${i}</li><li>b</li></ul><table><tr><td>k</td><td>${i}</td></tr></table><script>var x=${i}</script></div>`;
    }
    const start = performance.now();
    const page = extractPage(html);
    expect(performance.now() - start).toBeLessThan(200);
    expect(page.truncated).toBe(true);
    expect(page.blocks).toHaveLength(400);
  });
});

describe('deriveOutline', () => {
  const show = (nodes: OutlineNode[], depth = 0): string[] =>
    nodes.flatMap((n) => [`${'  '.repeat(depth)}${n.text}`, ...show(n.children, depth + 1)]);

  it('nests headings by level, tolerating skipped levels', () => {
    const h = (level: 1 | 2 | 3 | 4, text: string) => ({ kind: 'heading' as const, level, text });
    const blocks = [h(1, 'A'), { kind: 'paragraph' as const, text: 'p' }, h(2, 'B'), h(3, 'C'), h(2, 'D'), h(4, 'E'), h(1, 'F')];
    expect(show(deriveOutline(blocks))).toEqual(['A', '  B', '    C', '  D', '    E', 'F']);
  });

  it('builds the outline of an extracted article', () => {
    expect(show(deriveOutline(extract('wikipedia-article').blocks))).toEqual([
      'Internet Archive',
      '  History',
      '    Early years',
      '  Wayback Machine',
    ]);
  });
});
