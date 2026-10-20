import { describe, expect, it } from 'vitest';
import { normalizeForCompare as n } from './normalize.ts';

/** [category, before, after, same after normalisation?] : >= 2 positive and 1 negative per category. */
const CASES: [string, string, string, boolean][] = [
  ['iso date', 'Updated 2014-03-17.', 'Updated 2016-11-02.', true],
  ['iso date', 'Build 2014-03-17T09:12:00Z ok', 'Build 2020-01-01T00:00:00+01:00 ok', true],
  ['iso date', 'Released 2014-03-17.', 'Withdrawn 2014-03-17.', false],
  ['long date', 'Posted 17 March 2014 by Ana', 'Posted 2 June 2019 by Ana', true],
  ['long date', 'Posted Mar 17, 2014', 'Posted Sept. 3, 2021', true],
  ['long date', 'the 2014 Olympics', 'the 2018 Olympics', false],
  ['time', 'Generated at 09:12 UTC', 'Generated at 23:59 UTC', true],
  ['time', 'Doors open 7 pm', 'Doors open 10 p.m.', true],
  ['time', 'Use a 16:9 screen', 'Use a 4:3 screen', false],
  ['last updated', 'Last updated 3 hours ago', 'Last updated yesterday', true],
  ['last updated', 'This page was last edited on 17 March 2014, at 12:34.', 'This page was last edited on 2 May 2015, at 08:00.', true],
  ['last updated', 'Last updated today. New: a FAQ', 'Last updated today. New: a guide', false],
  ['copyright', '© 2009-2014 The Authors', '© 2009-2019 The Authors', true],
  ['copyright', 'Copyright 2012 Example Project', 'Copyright © 2023 Example Project', true],
  ['copyright', '© 2014 The Authors', '© 2014 Other Folks', false],
  ['counter', 'The wiki has 1,234 articles', 'The wiki has 56,789 articles', true],
  ['counter', '56 comments and 1.2k views', '3 comments and 990 views', true],
  ['counter', 'Read 3 reasons to switch', 'Read 5 reasons to switch', false],
  ['tracking', 'See example.org/a?utm_source=x&id=5', 'See example.org/a?id=5&fbclid=abc', true],
  ['tracking', 'Go to example.org/p?gclid=1&mc_eid=2', 'Go to example.org/p', true],
  ['tracking', 'See example.org/a?id=5', 'See example.org/a?id=6', false],
  ['cache-buster', 'Load app.js?v=1712', 'Load app.js?v=1813&_=99', true],
  ['cache-buster', 'Style site.css?ver=2.1', 'Style site.css?cb=8', true],
  ['cache-buster', 'Load app.js?v=2', 'Load lib.js?v=2', false],
  ['archive artefact', 'Link https://web.archive.org/web/20140317091200/https://example.org/', 'Link https://example.org/', true],
  ['archive artefact', 'Link //arquivo.pt/wayback/20160101000000id_/https://example.org/', 'Link https://example.org/', true],
  ['archive artefact', 'Link https://example.org/', 'Link https://example.net/', false],
  ['whitespace', 'Hello   big\n world', ' Hello big world ', true],
  ['whitespace', 'Hello world​', 'Hello world', true],
  ['whitespace', 'Hello world', 'Helloworld', false],
  ['quotes and dashes', '“Quoted” — it’s fine', '"Quoted" - it\'s fine', true],
  ['quotes and dashes', 'pages 1–5', 'pages 1-5', true],
  ['quotes and dashes', '"Quoted"', 'Quoted', false],
  ['nfc', 'Café', 'Café', true],
  ['nfc', 'Å ring', 'Å ring', true],
  ['nfc', 'Café', 'Cafe', false],
];

describe('normalizeForCompare', () => {
  it.each(CASES)('%s: %j vs %j -> same=%s', (_, a, b, same) => {
    expect(n(a) === n(b)).toBe(same);
  });

  it('keeps bare years and is idempotent', () => {
    expect(n('the 2014 Olympics')).toContain('2014');
    for (const [, a] of CASES) expect(n(n(a))).toBe(n(a));
  });
});
