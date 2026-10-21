// Live-mode smoke flows (phase 14). The Worker API is mocked with page.route('**/api/**') from
// test/fixtures/api/live.ts, so no flow reaches the Worker or the Internet Archive. Each mock keeps a request log
// (start/end times per request) that the flows assert on: concurrency, cancel, stale runs, and caching.
import type { Page } from 'playwright-core';
import { buildTimeline } from '../src/core/timeline.ts';
import { API_ERRORS, type MockApi, mockFromSample } from '../test/fixtures/api/live.ts';
import { type Flow, openReady } from './smoke-flows.ts';

const git = mockFromSample('git-scm');
const rust = mockFromSample('rust-lang');
const gitEntries = buildTimeline(git.url, git.pages).entries.length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Logged {
  path: string;
  target: string;
  ts: string | undefined;
  start: number;
  end?: number;
}
/** What a snapshot request gets: an answer after `delay` ms (default 150), an error, or (`delay: null`) no answer. */
type Plan = { delay?: number | null; error?: keyof typeof API_ERRORS };

async function mockApi(page: Page, opts: { data?: (target: string) => MockApi; captures?: keyof typeof API_ERRORS; snapshot?: (i: number) => Plan } = {}) {
  const log: Logged[] = [];
  const inFlight = new Map<string, number>();
  const maxInFlight = new Map<string, number>();
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const target = u.searchParams.get('url') ?? '';
    const entry: Logged = { path: u.pathname, target, ts: u.searchParams.get('ts') ?? undefined, start: Date.now() };
    log.push(entry);
    const api = (opts.data ?? (() => git))(target);
    let reply: { status: number; body: unknown } = { status: 404, body: { error: 'not_found', message: 'No such API.' } };
    if (u.pathname === '/api/captures') {
      reply = opts.captures ? API_ERRORS[opts.captures] : { status: 200, body: api.captures };
    } else if (u.pathname === '/api/snapshot') {
      const plan = opts.snapshot?.(api.captures.captures.findIndex((c) => c.ts === entry.ts)) ?? {};
      if (plan.delay === null) return; // held open: the browser waits until it gives up or aborts
      const n = (inFlight.get(target) ?? 0) + 1;
      inFlight.set(target, n);
      maxInFlight.set(target, Math.max(n, maxInFlight.get(target) ?? 0));
      await sleep(plan.delay ?? 150);
      inFlight.set(target, inFlight.get(target)! - 1);
      reply = plan.error ? API_ERRORS[plan.error] : { status: 200, body: api.snapshot(entry.ts ?? '') };
    }
    entry.end = Date.now();
    // The page may have aborted the request meanwhile (Cancel, a new run): nothing left to answer.
    await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) }).catch(() => {});
  });
  const snaps = (target?: string) => log.filter((l) => l.path === '/api/snapshot' && (!target || l.target === target));
  return { log, snaps, maxInFlight: (target: string) => maxInFlight.get(target) ?? 0 };
}

const liveUrl = (url: string) => `/?url=${encodeURIComponent(url)}`;
async function openLive(page: Page, baseUrl: string, url: string, status?: string): Promise<void> {
  await page.goto(new URL(liveUrl(url), baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.locator(status ? `[data-live="${status}"]` : '[data-live]').waitFor({ timeout: 20_000 });
}
const statusLine = (page: Page) => page.locator('.live-status p').innerText();
async function expectText(page: Page, sel: string, re: RegExp): Promise<string> {
  const t = (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  if (!re.test(t)) throw new Error(`${sel}: "${t}" does not match ${re}`);
  return t;
}
/** The card's two next actions are there. */
async function expectActions(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    if (!(await page.locator('.state-card').getByRole(name.startsWith('Save') ? 'link' : 'button', { name }).count())) throw new Error(`no "${name}" action`);
  }
}

/** Shared by live-loading and its reduced-motion variant: 6 captures answer, then the run waits on the Archive. */
async function loading(page: Page, baseUrl: string): Promise<string[]> {
  const api = await mockApi(page, { snapshot: (i) => (i < 6 ? {} : { delay: null }) });
  await openLive(page, baseUrl, 'git-scm.com', 'snapshots');
  await page.waitForFunction(() => document.querySelector('.live-status p')?.textContent?.includes('capture 7 of 14'), null, { timeout: 10_000 });
  const pending = await page.locator('.tl-pending').count();
  if (pending !== 8) throw new Error(`${pending} pending hairlines, expected 8`);
  if (!(await page.getByRole('button', { name: 'Cancel' }).isVisible())) throw new Error('no Cancel while loading');
  if (api.snaps().length !== 8) throw new Error(`${api.snaps().length} snapshot requests, expected 6 answered + 2 in flight`);
  return [await statusLine(page), `${pending} pending hairlines, ${await page.locator('.tl-marker').count()} markers so far`];
}

export const liveFlows: readonly Flow[] = [
  {
    name: 'live-success',
    description: 'Paste a URL: a first run is replaced by a second (no stale markers), 2 snapshots in flight at most, throttled announcements, Copy link deep link',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page, { data: (t) => (t.includes('rust') ? rust : git), snapshot: () => ({ delay: 150 }) });
      await openReady(page, baseUrl);
      if (api.log.length) throw new Error(`the first view called the API: ${api.log.map((l) => l.path).join(', ')}`);
      // Record what the polite live region says, and when.
      await page.evaluate(() => {
        const w = window as unknown as { said: [number, string][] };
        w.said = [];
        const region = document.querySelector('p.sr-only[role="status"][aria-live="polite"]')!;
        new MutationObserver(() => w.said.push([performance.now(), region.textContent ?? ''])).observe(region, { childList: true, characterData: true, subtree: true });
      });
      const input = page.getByRole('textbox', { name: 'See how any page changed' });
      await input.fill('rust-lang.org');
      await input.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-live="snapshots"]'));
      await page.waitForTimeout(400);
      const switchedAt = Date.now();
      await input.fill('git-scm.com');
      await input.press('Enter');
      await page.locator('#live-label', { hasText: 'git-scm.com' }).waitFor();
      await page.locator('[data-live="done"]').waitFor({ timeout: 20_000 });
      await sleep(600); // any answer still due for the first run lands now
      const markers = await page.locator('.tl-marker').count();
      if (markers !== gitEntries) throw new Error(`${markers} markers, expected ${gitEntries} (stale markers from the first run?)`);
      const late = api.snaps(rust.url).filter((l) => l.start > switchedAt);
      if (late.length) throw new Error(`${late.length} requests for the first run after the second started`);
      const max = api.maxInFlight(git.url);
      if (max > 2) throw new Error(`${max} snapshot requests in flight at once`);
      const done = await statusLine(page);
      if (!done.startsWith(`Done: 14 captures, ${gitEntries} meaningful changes.`)) throw new Error(`status "${done}"`);
      if (!page.url().includes(`url=${encodeURIComponent(git.url)}`)) throw new Error(`address bar ${page.url()}`);
      const said = await page.evaluate(() => (window as unknown as { said: [number, string][] }).said.filter(([, t]) => t));
      const gaps = said.slice(1).map(([t], i) => t - said[i]![0]);
      if (said.length < 2 || gaps.some((g) => g < 1900)) throw new Error(`announcements ${said.map(([t, s]) => `${Math.round(t)} ${s}`).join(' | ')}`);
      // Copy link: select the first change; the address bar is the shareable link and restores it.
      await page.locator('.tl-slider').focus();
      await page.keyboard.press('Home');
      const link = page.url();
      if (!link.includes('change=')) throw new Error(`no change in ${link}`);
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-live="done"]').waitFor({ timeout: 20_000 });
      const now = await page.locator('.tl-slider').getAttribute('aria-valuenow');
      if (now !== '1') throw new Error(`deep link selected change ${now}, expected 1`);
      return {
        notes: [
          `${markers} markers, max ${max} snapshot requests in flight, ${api.snaps(rust.url).length} first-run requests all before the switch`,
          `request log (ms from start): ${api.snaps(git.url).slice(0, 6).map((l) => `${l.ts?.slice(0, 8)} ${l.start - api.log[0]!.start}-${(l.end ?? 0) - api.log[0]!.start}`).join(', ')} …`,
          `announced: ${said.map(([t, s]) => `${Math.round(t)} ms "${s}"`).join(' | ')}`,
          `deep link ${link} restored change 1`,
        ],
      };
    },
  },
  {
    name: 'live-loading',
    description: 'Mid-run: status line with progress and Cancel, markers so far, grey hairlines for the captures still coming',
    cvd: true,
    async run({ page, baseUrl }) {
      return { notes: await loading(page, baseUrl) };
    },
  },
  {
    name: 'live-loading-reduced',
    description: 'Mid-run under prefers-reduced-motion: the progress dot does not pulse',
    shot: 'live-loading',
    suffix: '-reduced',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const notes = await loading(page, baseUrl);
      const d = await page.locator('.live-dot').evaluate((el) => getComputedStyle(el).animationDuration);
      if (d !== '0s') throw new Error(`live dot animates for ${d} under reduce`);
      return { notes: [...notes, 'live dot animation 0s'] };
    },
  },
  {
    name: 'live-cancel',
    description: 'Cancel stops the run within one in-flight answer; Start again resumes from the in-memory cache',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page, { snapshot: () => ({ delay: 800 }) });
      await openLive(page, baseUrl, 'git-scm.com', 'snapshots');
      await page.waitForFunction(() => document.querySelectorAll('.tl-cap').length >= 2, null, { timeout: 10_000 });
      await page.getByRole('button', { name: 'Cancel' }).click();
      const at = api.snaps().length;
      await sleep(2000);
      const after = api.snaps().length;
      if (after > at + 1) throw new Error(`${after - at} requests started after Cancel`);
      const text = await statusLine(page);
      if (!/^Stopped after \d+ of 14 captures\.$/.test(text)) throw new Error(`status "${text}"`);
      const fetched = new Set(api.snaps().filter((l) => l.end).map((l) => l.ts));
      await page.getByRole('button', { name: 'Start again' }).click();
      await page.locator('[data-live="done"]').waitFor({ timeout: 20_000 });
      const again = api.snaps().slice(after).filter((l) => fetched.has(l.ts));
      if (again.length) throw new Error(`${again.length} captures fetched twice`);
      return { notes: [`${at} requests at Cancel, ${after} two seconds later; "${text}"`, `Start again fetched ${api.snaps().length - after} new captures, none twice`] };
    },
  },
  {
    name: 'live-no-captures',
    description: 'No captures: empty state with Save it now and Open a sample (which opens the default sample)',
    shot: 'live-empty',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await mockApi(page, { captures: 'no_captures' });
      await openLive(page, baseUrl, 'example.org/about', 'error');
      const save = await page.getByRole('link', { name: /Save it now/ }).getAttribute('href');
      if (save !== 'https://web.archive.org/save/https://example.org/about') throw new Error(`Save it now -> ${save}`);
      await page.getByRole('button', { name: 'Open a sample' }).click();
      await page.waitForSelector('[data-ready="true"]');
      if (!page.url().endsWith('?sample=git-scm')) throw new Error(`Open a sample -> ${page.url()}`);
      await openLive(page, baseUrl, 'example.org/about', 'error');
      return { notes: [await expectText(page, '.state-card', /^No captures yet The Archive has no captures of example\.org\/about yet\./), `Save it now -> ${save}`] };
    },
  },
  {
    name: 'live-excluded',
    description: 'Excluded site: a specific error card with Try again (a new request) and Open a sample',
    shot: 'live-error-excluded',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page, { captures: 'excluded' });
      await openLive(page, baseUrl, 'example.org', 'error');
      await expectActions(page, ['Try again', 'Open a sample']);
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.waitForFunction(() => document.querySelector('[data-live="error"]'));
      if (api.log.length !== 2) throw new Error(`${api.log.length} captures requests after Try again, expected 2`);
      return { notes: [await expectText(page, '.state-card', /^⚠ This site is not in the Archive The site asked/)] };
    },
  },
  {
    name: 'live-rate-limited',
    description: 'The Archive rate-limits mid-run: the run stops at once, the card counts down the retry time, the timeline so far stays',
    shot: 'live-error-ratelimited',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page, { snapshot: (i) => (i === 4 ? { error: 'archive_rate_limited' } : {}) });
      await openLive(page, baseUrl, 'git-scm.com', 'error');
      const first = await expectText(page, '.state-card', /The Internet Archive asked us to slow down\. Try again in 40 s\./);
      const n = api.snaps().length;
      await sleep(1500);
      const later = await expectText(page, '.state-card', /Try again in 3[89] s\./);
      if (api.snaps().length !== n || n > 6) throw new Error(`${n} snapshot requests (then ${api.snaps().length}) after the rate limit`);
      await expectActions(page, ['Try again', 'Open a sample']);
      return { notes: [first, `then: ${later.match(/Try again in \d+ s/)?.[0]}`, `${n} snapshot requests in all`] };
    },
  },
  {
    name: 'live-partial-failure',
    description: 'Two captures fail: dashed marks, an inline note, and the run completes',
    shot: 'live-partial',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await mockApi(page, { snapshot: (i) => (i === 3 || i === 9 ? { error: 'archive_unavailable' } : {}) });
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      const dashed = await page.locator('.tl-failed').count();
      if (dashed !== 2) throw new Error(`${dashed} dashed marks, expected 2`);
      const text = await statusLine(page);
      if (!text.endsWith('2 captures could not be fetched (dashed).')) throw new Error(`status "${text}"`);
      return { notes: [text, await expectText(page, '#timeline-legend', /2 could not be fetched/)] };
    },
  },
  {
    name: 'live-no-meaningful-changes',
    description: 'Every capture says the same: "nothing meaningful changed" with the trivial count, and the toggle shows them',
    shot: 'live-no-meaningful',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await mockApi(page, { data: () => mockFromSample('git-scm', { same: true }) });
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      const text = await expectText(page, '.state-card', /14 captures, 2013–2025: nothing meaningful changed\. 13 trivial edits hidden \(dates, counters, whitespace\)\./);
      if (await page.locator('.tl-slider').count()) throw new Error('a slider with no changes');
      if (!(await page.getByRole('checkbox', { name: 'Show trivial edits' }).count())) throw new Error('no "Show trivial edits" toggle');
      return { notes: [text] };
    },
  },
  {
    name: 'live-invalid-url',
    description: 'An invalid address is refused at the field (aria-invalid, described error), and never reaches the API; nor does the first view',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page);
      await openReady(page, baseUrl);
      const input = page.getByRole('textbox', { name: 'See how any page changed' });
      await input.fill('ftp://example.org/file');
      await input.press('Enter');
      const m = await input.evaluate((el) => ({
        invalid: el.getAttribute('aria-invalid'),
        described: document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? '',
        focused: el === document.activeElement,
      }));
      if (m.invalid !== 'true' || !m.described.trim() || !m.focused) throw new Error(`field: ${JSON.stringify(m)}`);
      await page.goto(new URL('/?url=javascript%3Aalert(1)', baseUrl).href);
      await page.waitForSelector('[data-ready="true"]');
      if (!(await page.locator('#url-error').innerText()).trim()) throw new Error('no error for an invalid ?url=');
      await page.goto(new URL('/?url=ftp%3A%2F%2Fexample.org', baseUrl).href);
      await page.waitForSelector('[data-ready="true"]');
      if (api.log.length) throw new Error(`the API was called: ${api.log.map((l) => l.path).join(', ')}`);
      return { notes: [`error: ${m.described.trim()}`, '0 API requests'] };
    },
  },
];
