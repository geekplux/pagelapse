import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_HOST, pagePath, startAnalytics } from './analytics.ts';

const live = { hostname: ANALYTICS_HOST, origin: `https://${ANALYTICS_HOST}`, pathname: '/' };
let win: { dataLayer?: unknown[] };
let scripts: { async: boolean; src: string }[];
const entries = () => (win.dataLayer ?? []).map((args) => Array.from(args as ArrayLike<unknown>));

beforeEach(() => {
  win = {};
  scripts = [];
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    createElement: () => ({ async: false, src: '' }),
    head: { append: (el: { async: boolean; src: string }) => scripts.push(el) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('pagePath', () => {
  it('keeps the known pages and folds anything else into /other', () => {
    expect(pagePath('/')).toBe('/');
    expect(pagePath('')).toBe('/');
    expect(pagePath('/someone@example.com')).toBe('/other');
  });
});

describe('startAnalytics', () => {
  it('stays off without a measurement id, and off any other host', () => {
    expect(startAnalytics(live, '')).toBe(false);
    expect(startAnalytics({ ...live, hostname: 'localhost' }, 'G-TEST')).toBe(false);
    expect(win.dataLayer).toBeUndefined();
    expect(scripts).toEqual([]);
  });

  it('on the live host loads gtag.js, with the path only and signals off', () => {
    expect(startAnalytics(live, 'G-TEST')).toBe(true);
    expect(scripts).toEqual([{ async: true, src: 'https://www.googletagmanager.com/gtag/js?id=G-TEST' }]);
    expect(entries().find(([cmd]) => cmd === 'config')).toEqual([
      'config',
      'G-TEST',
      {
        page_location: `${live.origin}/`,
        page_title: 'Pagelapse',
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    ]);
  });
});
