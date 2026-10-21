// Live-mode smoke flows (phases 14-15). The Worker API is mocked with page.route('**/api/**') from
// test/fixtures/api/live.ts, and the Internet Archive's replay frames (https://web.archive.org/web/**) are stubbed with
// test/fixtures/replay/stub.html, so no flow reaches the Worker or the Archive. Each mock keeps a request log (start/end
// times per request) that the flows assert on: concurrency, cancel, stale runs, caching, frame dwell, pool and preload.
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { buildTimeline } from '../src/core/timeline.ts';
import { API_ERRORS, GIT_AI_SUMMARIES, type MockApi, mockFromSample } from '../test/fixtures/api/live.ts';
import { type Flow, openDisclosure, openReady, openTimelineKey } from './smoke-flows.ts';
import { replayFrameUrl } from '../src/core/url.ts';

const git = mockFromSample('git-scm');
const rust = mockFromSample('rust-lang');
const gitTimeline = buildTimeline(git.url, git.pages).entries;
const gitEntries = gitTimeline.length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Logged {
  path: string;
  target: string;
  ts: string | undefined;
  /** `/api/summaries`: the pairs asked for. */
  pairs?: string[];
  start: number;
  end?: number;
}
/** What a snapshot request gets: an answer after `delay` ms (default 150), an error, or (`delay: null`) no answer. */
type Plan = { delay?: number | null; error?: keyof typeof API_ERRORS };

const STUB = readFileSync(new URL('../test/fixtures/replay/stub.html', import.meta.url), 'utf8');
/** Every stubbed replay URL, across flows: smoke.ts reports them as `stubbed`, apart from blocked external requests. */
export const replayLog: { url: string; at: number }[] = [];
/** Host without `www.`: the app sends the normalised address, the fixture has the canonical one. */
const host = (u: string) => (URL.canParse(u) ? new URL(u).hostname.replace(/^www\./, '') : u);

/**
 * Stubs the Archive's replay frames: each answers with the stub page after `delay(ts)` ms (default 0), or never
 * (`null`, a stand-in for a blocked or stalled frame). Returns the frame request log.
 */
async function stubReplay(page: Page, delay: (ts: string) => number | null = () => 0) {
  const log: { ts: string; url: string; start: number }[] = [];
  await page.route('https://web.archive.org/web/**', async (route) => {
    const url = route.request().url();
    const [, ts = '', target = ''] = /\/web\/(\d{14})if_\/(.*)$/.exec(url) ?? [];
    log.push({ ts, url, start: Date.now() });
    replayLog.push({ url, at: Date.now() });
    const ms = delay(ts);
    if (ms === null) return;
    await sleep(ms);
    const body = STUB.replaceAll('{{ts}}', ts).replaceAll('{{url}}', target);
    await route.fulfill({ status: 200, contentType: 'text/html', headers: { 'cache-control': 'no-store' }, body }).catch(() => {});
  });
  return log;
}

export async function mockApi(
  page: Page,
  opts: {
    data?: (target: string) => MockApi; captures?: keyof typeof API_ERRORS; snapshot?: (i: number) => Plan; frame?: (ts: string) => number | null;
    /** `/api/summaries`: Workers AI lines (git-scm), a 500, or (default) "rule" for every pair, as without a binding. */
    summaries?: 'ai' | 'some' | 'error';
  } = {},
) {
  const frames = await stubReplay(page, opts.frame);
  const log: Logged[] = [];
  const inFlight = new Map<string, number>();
  const maxInFlight = new Map<string, number>();
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const target = host(u.searchParams.get('url') ?? '');
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
    } else if (u.pathname === '/api/summaries') {
      const { pairs } = route.request().postDataJSON() as { pairs: { from: string; to: string }[] };
      entry.pairs = pairs.map((p) => `${p.from}-${p.to}`);
      await sleep(300);
      // 'some': AI lines for every other change only (a mixed list).
      const line = (pair: string, i = gitTimeline.findIndex((e) => `${e.from}-${e.to}` === pair)) => (opts.summaries === 'some' && i % 2 ? undefined : GIT_AI_SUMMARIES[i]);
      reply = opts.summaries === 'error'
        ? { status: 500, body: { error: 'archive_unavailable', message: 'Something went wrong.' } }
        : { status: 200, body: { summaries: entry.pairs.map((pair) => (opts.summaries !== 'error' && opts.summaries && line(pair) ? { pair, source: 'ai', text: line(pair) } : { pair, source: 'rule' })) } };
    }
    entry.end = Date.now();
    // The page may have aborted the request meanwhile (Cancel, a new run): nothing left to answer.
    await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) }).catch(() => {});
  });
  const snaps = (target?: string) => log.filter((l) => l.path === '/api/snapshot' && (!target || l.target === host(target)));
  /** Frame requests since `t` (ms epoch). */
  const framesSince = (t: number) => frames.filter((f) => f.start >= t);
  const sums = () => log.filter((l) => l.path === '/api/summaries');
  return { log, snaps, sums, frames, framesSince, maxInFlight: (target: string) => maxInFlight.get(host(target)) ?? 0 };
}

/**
 * Waits until every replay frame under `sel` has fired `load`, brings them into the viewport (headless Chrome paints
 * an out-of-process frame only there) and gives them 500 ms to paint, so the flow's screenshot shows the pages.
 */
export async function framesPainted(page: Page, sel: string): Promise<string> {
  const n = await page.locator(`${sel} iframe`).count();
  await page.waitForFunction(
    (s) => {
      const fs = [...document.querySelectorAll<HTMLIFrameElement>(`${s} iframe`)];
      return fs.length > 0 && fs.every((f) => f.hasAttribute('data-loaded'));
    },
    sel,
    { timeout: 10_000 },
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator(sel).scrollIntoViewIfNeeded();
  await sleep(500);
  return `${n} frames loaded, then 500 ms to paint before the shot`;
}

const liveUrl = (url: string) => `/?url=${encodeURIComponent(url)}`;
export async function openLive(page: Page, baseUrl: string, url: string, status?: string): Promise<void> {
  await page.goto(new URL(liveUrl(url), baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.locator(status ? `[data-live="${status}"]` : '[data-live]').waitFor({ timeout: 20_000 });
}
const statusLine = (page: Page) => page.locator('.live-status p').innerText();
/** Where keyboard focus is, as a short selector-like description (`body` when it was lost, WCAG 2.4.3). */
const focusAt = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'body';
    return `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}${a.className ? `.${String(a.className).split(' ').join('.')}` : ''} "${(a.textContent ?? '').trim().slice(0, 40)}"`;
  });
/** Waits until focus is on an element matching `sel`; fails with where it is otherwise. */
async function expectFocus(page: Page, sel: string, what: string): Promise<string> {
  const ok = await page.waitForFunction((s) => document.activeElement?.matches(s), sel, { timeout: 5000 }).then(
    () => true,
    () => false,
  );
  const at = await focusAt(page);
  if (!ok) throw new Error(`${what}: focus on ${at}, expected ${sel}`);
  return `${what}: focus on ${at}`;
}
/** Focuses the status line's Cancel as soon as it appears (a ?url= load: nothing has focus until then). */
const focusCancelOnSight = (page: Page) =>
  page.addInitScript(() => {
    new MutationObserver((_, obs) => {
      const b = [...document.querySelectorAll<HTMLElement>('.live-status button')].find((x) => x.textContent === 'Cancel');
      if (!b) return;
      b.focus();
      obs.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
async function expectText(page: Page, sel: string, re: RegExp): Promise<string> {
  const t = (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  if (!re.test(t)) throw new Error(`${sel}: "${t}" does not match ${re}`);
  return t;
}
/**
 * Tabs through the whole page (until focus wraps or leaves it) and fails if focus ever lands on an archive frame: the
 * frames are always inert, a scaled picture of the page. Returns how many stops it made.
 */
async function expectFramesNotTabbable(page: Page): Promise<string> {
  const frames = await page.locator('iframe').evaluateAll((els) => els.map((el) => (el as HTMLIFrameElement).inert));
  if (!frames.length || frames.some((i) => !i)) throw new Error(`iframes inert: ${JSON.stringify(frames)}`);
  // Start from the top of the document (a blur alone resumes from the last focused element).
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute('tabindex');
  });
  const seen = new Set<string>();
  let pane = 0;
  let stops = 0;
  for (; stops < 200; stops++) {
    await page.keyboard.press('Tab');
    const [at, inPane] = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return ['body', false];
      if (a.tagName === 'IFRAME') return ['IFRAME', false];
      // The pane's controls: in the picture, and (since phase 17) in the controls row beside it.
      return [`${a.tagName}#${a.id}.${a.className}|${(a.textContent ?? '').slice(0, 60)}|${[...document.querySelectorAll('*')].indexOf(a)}`, !!a.closest('.vpane, .controls')];
    });
    if (at === 'IFRAME') throw new Error(`Tab stop ${stops + 1} is inside an archived page`);
    if (at === 'body' || seen.has(at)) break;
    seen.add(at as string);
    if (inPane) pane++;
  }
  if (pane < 2) throw new Error(`the Tab walk passed only ${pane} stop(s) in the picture pane (${seen.size} in all)`);
  return `${frames.length} iframe(s), all inert; ${seen.size} Tab stops from the top of the page (${pane} in the pane), none in a frame`;
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
      if (api.log.length || api.frames.length) throw new Error(`the first view called the API or the Archive: ${[...api.log.map((l) => l.path), ...api.frames.map((f) => f.url)].join(', ')}`);
      // Record what the polite live region says, and when.
      await page.evaluate(() => {
        const w = window as unknown as { said: [number, string][] };
        w.said = [];
        const region = document.querySelector('p.sr-only[role="status"][aria-live="polite"]')!;
        new MutationObserver(() => w.said.push([performance.now(), region.textContent ?? ''])).observe(region, { childList: true, characterData: true, subtree: true });
      });
      // Where the timeline starts, sampled through the runs: it must not jump by more than a status line.
      await page.evaluate(() => {
        const w = window as unknown as { tops: number[] };
        w.tops = [];
        setInterval(() => {
          // During the runs: the sample's own layout before them does not count.
          const t = document.querySelector('[data-live] .tl-area')?.getBoundingClientRect().top;
          if (t !== undefined) w.tops.push(Math.round(t + scrollY));
        }, 50);
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
      if (!api.snaps(rust.url).length) throw new Error('no first-run requests logged: the host matcher is wrong');
      const late = api.snaps(rust.url).filter((l) => l.start > switchedAt);
      if (late.length) throw new Error(`${late.length} requests for the first run after the second started`);
      const tops = await page.evaluate(() => (window as unknown as { tops: number[] }).tops);
      const jump = Math.max(...tops) - Math.min(...tops);
      if (jump > 48) throw new Error(`the timeline moved by ${jump}px during the runs: ${tops.filter((t, i) => t !== tops[i - 1]).join(' ')}`);
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
          `timeline top moved ${jump}px over ${tops.length} samples`,
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
      const cancelledAt = Date.now();
      const at = api.snaps().length;
      await sleep(2000);
      const after = api.snaps().length;
      if (after > at + 1) throw new Error(`${after - at} requests started after Cancel`);
      const text = await statusLine(page);
      if (!/^Stopped after \d+ of 14 captures\.$/.test(text)) throw new Error(`status "${text}"`);
      // Answers that arrived before Cancel are cached; the ones Cancel aborted are fetched again.
      const fetched = new Set(api.snaps().filter((l) => l.end && l.end < cancelledAt - 100).map((l) => l.ts));
      const onStop = await focusAt(page);
      if (!onStop.includes('Start again')) throw new Error(`after Cancel, focus on ${onStop}, expected Start again`);
      await page.getByRole('button', { name: 'Start again' }).click();
      // Start again goes away with the old run: focus moves to the new run's status line, not <body>.
      const restarted = await expectFocus(page, '.live-status p', 'Start again');
      // Focus on Cancel when the run ends (Cancel goes away): focus moves to the status line.
      await page.getByRole('button', { name: 'Cancel' }).focus();
      await page.locator('[data-live="done"]').waitFor({ timeout: 20_000 });
      const finished = await expectFocus(page, '.live-status p', 'run ended on Cancel');
      const again = api.snaps().slice(after).filter((l) => fetched.has(l.ts));
      if (again.length) throw new Error(`${again.length} captures fetched twice`);
      return {
        notes: [`${at} requests at Cancel, ${after} two seconds later; "${text}"`, `Start again fetched ${api.snaps().length - after} new captures, none twice`, restarted, finished],
      };
    },
  },
  {
    name: 'live-slider-focus',
    description: 'While the timeline slider has focus during a run, its value and range stay put as changes arrive; a key catches up (End reaches the newest) and says how many are new',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await mockApi(page, { snapshot: (i) => (i < 4 ? {} : i < 11 ? { delay: 500 } : { delay: null }) });
      await openLive(page, baseUrl, 'git-scm.com', 'snapshots');
      const slider = page.locator('.tl-slider');
      await slider.waitFor({ timeout: 10_000 });
      await slider.focus();
      const values = () => slider.evaluate((el) => `${el.getAttribute('aria-valuenow')}/${el.getAttribute('aria-valuemax')}`);
      const before = await values();
      const max = Number(before.split('/')[1]);
      // Wait until more changes have arrived than the slider shows (the changes list keeps growing).
      await page.waitForFunction((n) => Number(/\((\d+)\)/.exec(document.querySelector('#changes-heading')?.textContent ?? '')?.[1]) > n, max, { timeout: 10_000 });
      const during = await values();
      if (during !== before) throw new Error(`slider changed from ${before} to ${during} without input`);
      const listed = () => page.evaluate(() => Number(/\((\d+)\)/.exec(document.querySelector('#changes-heading')?.textContent ?? '')?.[1]));
      await page.keyboard.press('End');
      const [end, now] = [await values(), await listed()];
      if (end !== `${now}/${now}` || now <= max) throw new Error(`End went to ${end}, expected the newest of ${now} changes`);
      const said = await page
        .waitForFunction(() => /\d+ more changes? arrived\./.exec(document.querySelector('.tl-area [role="status"]')?.textContent ?? '')?.input, null, { timeout: 4000 })
        .then((h) => h.jsonValue());
      // More changes arrive: the slider stays put again until the next key.
      await page.waitForFunction((n) => Number(/\((\d+)\)/.exec(document.querySelector('#changes-heading')?.textContent ?? '')?.[1]) > n, now, { timeout: 10_000 });
      const still = await values();
      if (still !== end) throw new Error(`slider changed from ${end} to ${still} without input`);
      return { notes: [`slider ${before} on focus, ${during} while changes arrived, ${end} after End (newest), ${still} while more arrived`, `announced "${said}"`] };
    },
  },
  {
    name: 'live-no-captures',
    apiErrors: true,
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
      const sampled = await expectFocus(page, '.chip[aria-pressed="true"][data-sample="git-scm"]', 'empty state Open a sample');
      await openLive(page, baseUrl, 'example.org/about', 'error');
      if ((await focusAt(page)) !== 'body') throw new Error(`a ?url= load moved focus to ${await focusAt(page)}`);
      return { notes: [await expectText(page, '.state-card', /^No captures yet The Archive has no captures of example\.org\/about yet\./), `Save it now -> ${save}`, sampled] };
    },
  },
  {
    name: 'live-excluded',
    apiErrors: true,
    description: 'Excluded site: a specific error card with Try again (a new request) and Open a sample',
    shot: 'live-error-excluded',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page, { captures: 'excluded' });
      await openLive(page, baseUrl, 'example.org', 'error');
      await expectActions(page, ['Try again', 'Open a sample']);
      await page.getByRole('button', { name: 'Try again' }).click();
      // Try again goes away with the old run: focus lands on the new run's status, then on the new card's heading.
      const retried = await expectFocus(page, '#state-heading', 'error card Try again');
      if (api.log.length !== 2) throw new Error(`${api.log.length} captures requests after Try again, expected 2`);
      const text = await expectText(page, '.state-card', /^⚠ This site is not in the Archive The site asked/);
      await page.getByRole('button', { name: 'Open a sample' }).click();
      await page.waitForSelector('[data-ready="true"]');
      const sampled = await expectFocus(page, '.chip[aria-pressed="true"]', 'error card Open a sample');
      // Back to the card for the screenshot.
      await openLive(page, baseUrl, 'example.org', 'error');
      return { notes: [text, retried, sampled] };
    },
  },
  {
    name: 'live-rate-limited',
    apiErrors: true,
    description: 'The Archive rate-limits mid-run: the run stops at once, the card counts down the retry time, the timeline so far stays',
    shot: 'live-error-ratelimited',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page, { snapshot: (i) => (i === 4 ? { error: 'archive_rate_limited' } : {}) });
      await focusCancelOnSight(page);
      await openLive(page, baseUrl, 'git-scm.com', 'error');
      // Cancel had focus when the error card replaced the status line: focus moves to the card's heading.
      const moved = await expectFocus(page, '#state-heading', 'error replaced Cancel');
      const first = await expectText(page, '.state-card', /The Internet Archive asked us to slow down\. Try again in 40 s\./);
      const n = api.snaps().length;
      await sleep(1500);
      const later = await expectText(page, '.state-card', /Try again in 3[89] s\./);
      if (api.snaps().length !== n || n > 6) throw new Error(`${n} snapshot requests (then ${api.snaps().length}) after the rate limit`);
      await expectActions(page, ['Try again', 'Open a sample']);
      const retry = await page.getByRole('button', { name: 'Try again' }).getAttribute('aria-disabled');
      if (retry !== 'true') throw new Error(`Try again is aria-disabled="${retry}" during the countdown`);
      // Pressing it during the wait does nothing (Playwright's click() refuses an aria-disabled button: use the keyboard).
      await page.getByRole('button', { name: 'Try again' }).focus();
      await page.keyboard.press('Enter');
      await sleep(300);
      if (api.snaps().length !== n || !(await page.locator('[data-live="error"]').count())) throw new Error('Try again started a run during the countdown');
      return { notes: [first, `then: ${later.match(/Try again in \d+ s/)?.[0]}`, `${n} snapshot requests in all`, moved, 'Try again aria-disabled during the countdown'] };
    },
  },
  {
    name: 'live-partial-failure',
    apiErrors: true,
    description: 'Two captures fail: dashed marks, an inline note, and the run completes',
    shot: 'live-partial',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await mockApi(page, { snapshot: (i) => (i === 3 || i === 9 ? { error: 'archive_unavailable' } : {}) });
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      if ((await focusAt(page)) !== 'body') throw new Error(`a ?url= load moved focus to ${await focusAt(page)}`);
      const dashed = await page.locator('.tl-failed').count();
      if (dashed !== 2) throw new Error(`${dashed} dashed marks, expected 2`);
      const text = await statusLine(page);
      if (!text.endsWith('2 captures could not be fetched (dashed).')) throw new Error(`status "${text}"`);
      await openTimelineKey(page);
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
      await openTimelineKey(page);
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
      // The same mistake again: the alert empties, then fills again, so it is announced again.
      await page.evaluate(() => {
        const w = window as unknown as { alerts: string[] };
        w.alerts = [];
        const el = document.getElementById('url-error')!;
        new MutationObserver(() => w.alerts.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
      });
      await input.press('Enter');
      await page.waitForFunction(() => (window as unknown as { alerts: string[] }).alerts.some((t) => t.trim()), null, { timeout: 2000 });
      const alerts = await page.evaluate(() => (window as unknown as { alerts: string[] }).alerts);
      if (alerts[0]?.trim() !== '' || !alerts.at(-1)?.includes(m.described.trim().replace(/^⚠\s*/, ''))) throw new Error(`repeat alert ${JSON.stringify(alerts)}`);
      await page.goto(new URL('/?url=javascript%3Aalert(1)', baseUrl).href);
      await page.waitForSelector('[data-ready="true"]');
      if (!(await page.locator('#url-error').innerText()).trim()) throw new Error('no error for an invalid ?url=');
      await page.goto(new URL('/?url=ftp%3A%2F%2Fexample.org', baseUrl).href);
      await page.waitForSelector('[data-ready="true"]');
      if (api.log.length) throw new Error(`the API was called: ${api.log.map((l) => l.path).join(', ')}`);
      return { notes: [`error: ${m.described.trim()}`, `repeated submit re-announced (${alerts.length} alert mutations)`, '0 API requests'] };
    },
  },
  {
    name: 'live-archive-unavailable',
    apiErrors: true,
    description: 'The Archive does not answer: a calm card with the cause, Try again and Open a sample, no countdown',
    shot: 'live-error-unavailable',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await mockApi(page, { captures: 'archive_unavailable' });
      await openLive(page, baseUrl, 'git-scm.com', 'error');
      await expectActions(page, ['Try again', 'Open a sample']);
      if (await page.getByRole('button', { name: 'Try again' }).getAttribute('aria-disabled')) throw new Error('Try again disabled without a wait');
      return { notes: [await expectText(page, '.state-card', /^⚠ The Archive is not answering The Internet Archive is not responding right now\./)] };
    },
  },
  {
    name: 'live-own-rate-limit',
    apiErrors: true,
    description: 'Our own per-connection limit: a specific card with a 60 s countdown; Try again waits for it',
    shot: 'live-error-own-limit',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page, { captures: 'rate_limited' });
      await openLive(page, baseUrl, 'git-scm.com', 'error');
      const text = await expectText(page, '.state-card', /^⚠ Too many lookups at once You started many new lookups in a short time\. Try again in (60|59) s\./);
      const retry = page.getByRole('button', { name: 'Try again' });
      if ((await retry.getAttribute('aria-disabled')) !== 'true') throw new Error('Try again is not aria-disabled during the countdown');
      await retry.focus();
      await page.keyboard.press('Enter');
      await sleep(300);
      if (api.log.length !== 1) throw new Error(`${api.log.length} API requests, expected 1`);
      return { notes: [text, 'Try again aria-disabled during the countdown, pressing it made no request'] };
    },
  },
  {
    name: 'live-visual',
    description: 'Live pane: no Archive request before a run; after it, selecting a change mounts exactly one sandboxed replay frame, >= 400 ms later',
    cvd: true,
    async run({ page, baseUrl }) {
      if (gitEntries < 3) throw new Error('the flow needs >= 3 changes');
      // Snapshots answer slowly (600 ms each), so the newest change rests well past 400 ms many times during the run.
      const api = await mockApi(page, { snapshot: () => ({ delay: 600 }) });
      await openReady(page, baseUrl);
      await sleep(500);
      if (api.frames.length) throw new Error(`${api.frames.length} Archive requests on the first view`);
      const input = page.getByRole('textbox', { name: 'See how any page changed' });
      await input.fill('git-scm.com');
      await input.press('Enter');
      // During the run, with no user input: the silhouette and its tag's note, never a frame.
      const hold = await expectText(page, '.vp-hold', /^the page itself loads when you pick a change or the run finishes$/);
      if (!(await page.locator('.lf .sil').isVisible())) throw new Error('no silhouette while the run holds the frame');
      await page.locator('[data-live="done"]').waitFor({ timeout: 30_000 });
      const done = Date.now();
      const during = api.frames.filter((f) => f.start < done).length;
      if (during) throw new Error(`${during} replay requests while the run was fetching, expected 0`);
      await page.locator('.lf iframe[data-loaded]:not([data-hidden])').waitFor({ timeout: 5000 });
      if (await page.locator('.vp-hold').count()) throw new Error('the hold note stayed after the run');
      const after = api.frames.length;
      if (after > 1) throw new Error(`${after} replay requests after the run, expected <= 1: ${api.frames.map((f) => f.ts).join(', ')}`);
      // Home: the first change, never the neighbour preloaded beside the latest one.
      const t0 = Date.now();
      await page.locator('.tl-slider').focus();
      await page.keyboard.press('Home');
      await page.locator('.lf iframe[data-loaded]:not([data-hidden])').first().waitFor({ timeout: 5000 });
      await sleep(300);
      const want = replayFrameUrl('internet-archive', git.captures.captures.find((c) => c.ts === buildTimeline(git.url, git.pages).entries[0]!.to)!.ts, 'https://git-scm.com/');
      const got = api.framesSince(t0);
      if (got.length !== 1 || got[0]!.url !== want) throw new Error(`frame requests after Home: ${got.map((f) => f.url).join(', ') || 'none'}, expected ${want}`);
      const dwell = got[0]!.start - t0;
      if (dwell < 400) throw new Error(`the frame was requested ${dwell} ms after the selection`);
      const f = await page.locator('.lf iframe:not([data-hidden])').evaluate((el: HTMLIFrameElement) => ({
        sandbox: el.getAttribute('sandbox'), allow: el.getAttribute('allow'), referrer: el.getAttribute('referrerpolicy'), title: el.title, src: el.src, inert: el.inert,
      }));
      if (f.sandbox !== 'allow-scripts allow-same-origin' || f.allow !== '' || f.referrer !== 'strict-origin-when-cross-origin' || !/as captured \d+ \w+ \d{4}/.test(f.title) || !f.inert) {
        throw new Error(`frame attributes ${JSON.stringify(f)}`);
      }
      const frames = await page.locator('iframe').count();
      const box = await page.locator('.lf iframe:not([data-hidden])').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const m = el.parentElement!.getBoundingClientRect();
        return `frame ${Math.round(r.width)}×${Math.round(r.height)} in a ${Math.round(m.width)}×${Math.round(m.height)} box (--k ${getComputedStyle(el.parentElement!).getPropertyValue('--k')})`;
      });
      // The frame keeps its name for screen readers in the box (an inert frame leaves the accessibility tree).
      const named = await page.locator('.lf .sr-only').first().innerText();
      if (named !== f.title) throw new Error(`the frame's box is named "${named}", expected "${f.title}"`);
      const tabbing = await expectFramesNotTabbable(page);
      // Headless Chrome paints an out-of-process frame only while it is in the viewport: scroll it back for the shot.
      await page.evaluate(() => scrollTo(0, 0));
      await sleep(300);
      return { notes: [hold, `run with no input: ${during} replay requests while fetching, ${after} after it ended (the selected capture)`, box, tabbing, `first view: 0 Archive requests`, `Home -> 1 frame request after ${dwell} ms: ${got[0]!.url}`, `attributes ${JSON.stringify(f)}`, `${frames} iframes in the DOM`] };
    },
  },
  {
    name: 'live-visual-scrub',
    description: 'Five Right presses within 1 s request only the final selection; scrubbing across 16 changes never mounts more than 3 frames',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page);
      const entries = buildTimeline(git.url, git.pages).entries;
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      await page.locator('.tl-slider').focus();
      await page.keyboard.press('Home');
      await page.locator('.lf iframe[data-loaded]:not([data-hidden])').waitFor({ timeout: 5000 });
      await sleep(300);
      const t0 = Date.now();
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
        await sleep(150);
      }
      const pressed = Date.now() - t0;
      await sleep(1200);
      const got = api.framesSince(t0);
      if (pressed > 1000 || got.length !== 1 || got[0]!.ts !== entries[5]!.to) throw new Error(`after 5 presses in ${pressed} ms: ${got.map((f) => f.ts).join(', ') || 'none'}, expected ${entries[5]!.to}`);
      // Across 16 changes, resting on each: the pool never holds more than 3 frames.
      let most = 0;
      const steps = [...Array(entries.length - 1).fill('ArrowRight'), ...Array(16 - (entries.length - 1)).fill('ArrowLeft')] as string[];
      await page.keyboard.press('Home');
      for (const key of steps) {
        await page.keyboard.press(key);
        await sleep(450);
        most = Math.max(most, await page.locator('iframe').count());
      }
      await sleep(2500);
      const left = await page.locator('iframe').count();
      if (most > 3 || left > 3) throw new Error(`${most} iframes at most while scrubbing, ${left} after`);
      const log = api.frames.map((f) => `${f.ts} +${f.start - api.frames[0]!.start}ms`);
      return { notes: [`5 Right presses in ${pressed} ms -> 1 frame request (${got[0]!.ts})`, `${steps.length} changes scrubbed: at most ${most} iframes, ${left} after`, `stubbed request log: ${log.join(', ')}`] };
    },
  },
  {
    name: 'live-visual-preload',
    description: 'After the shown frame loads and 2 s pass, exactly one neighbour preloads, hidden and inert; none in Slider mode',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page);
      const entries = buildTimeline(git.url, git.pages).entries;
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      await page.locator('.lf iframe[data-loaded]:not([data-hidden])').waitFor({ timeout: 5000 });
      const t0 = Date.now();
      await sleep(1500);
      const early = api.framesSince(t0).length;
      await sleep(1300);
      const got = api.framesSince(t0);
      const near = entries.at(-2)!.to;
      if (early || got.length !== 1 || got[0]!.ts !== near) throw new Error(`neighbour requests: ${early} before 2 s, then ${got.map((f) => f.ts).join(', ') || 'none'} (expected ${near})`);
      const hidden = await page.locator('.lf iframe[data-hidden]').evaluate((el: HTMLIFrameElement) => ({ inert: el.inert, ariaHidden: el.getAttribute('aria-hidden'), visibility: getComputedStyle(el).visibility }));
      if (!hidden.inert || hidden.ariaHidden !== 'true' || hidden.visibility !== 'hidden') throw new Error(`preloaded frame ${JSON.stringify(hidden)}`);
      const t1 = Date.now();
      await openDisclosure(page, 'Compare');
      await page.getByRole('radio', { name: 'Slider' }).check();
      await page.locator('.vp-cmp iframe[data-loaded]').nth(1).waitFor({ timeout: 5000 });
      await sleep(3000);
      const compare = api.framesSince(t1);
      if (compare.length !== 2) throw new Error(`Slider mode requested ${compare.map((f) => f.ts).join(', ')}, expected its 2 sides only`);
      const log = api.frames.map((f) => `${f.ts} +${f.start - api.frames[0]!.start}ms`);
      return { notes: [`1 neighbour (${near}) after load + 2 s: ${JSON.stringify(hidden)}`, `Slider: ${compare.length} requests (the two sides), no preload in 3 s`, `stubbed request log: ${log.join(', ')}`] };
    },
  },
  {
    name: 'live-visual-slow',
    description: 'A frame that never loads (a blocked-framing stand-in) shows its silhouette, then at 8 s the honest "still loading" note with a link out; a slow one shows the silhouette until it loads',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const entries = buildTimeline(git.url, git.pages).entries;
      const latest = entries.at(-1)!.to;
      await mockApi(page, { frame: (ts) => (ts === latest ? null : 2500) });
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      await page.locator('.lf iframe').waitFor({ state: 'attached', timeout: 5000 });
      const t0 = Date.now();
      if (!(await page.locator('.lf .sil').isVisible()) || (await page.locator('.lf-note p').count())) throw new Error('no silhouette while loading, or a note too early');
      const note = page.locator('.lf-note p');
      await note.waitFor({ timeout: 12_000 });
      const after = Date.now() - t0;
      const text = await expectText(page, '.lf-note p', /^◷ Still loading from the Internet Archive\. Archived pages can be slow, and some sites block being shown in a frame\. Open capture/);
      const href = await note.getByRole('link').getAttribute('href');
      if (href !== `https://web.archive.org/web/${latest}/https://git-scm.com/`) throw new Error(`link out ${href}`);
      if (!(await page.locator('.lf .sil').isVisible())) throw new Error('the silhouette went away while still loading');
      // A slow frame (2.5 s): its silhouette shows until it loads, and no note.
      await page.locator('.tl-slider').focus();
      await page.keyboard.press('ArrowLeft');
      await sleep(1800);
      const waiting = (await page.locator('.lf .sil').isVisible()) && !(await page.locator('.lf iframe[data-loaded]:not([data-hidden])').count());
      await page.locator('.lf iframe[data-loaded]:not([data-hidden])').waitFor({ timeout: 5000 });
      const gone = !(await page.locator('.lf .sil').count()) && !(await note.count());
      if (!waiting || !gone) throw new Error(`slow frame: silhouette while loading ${waiting}, gone after ${gone}`);
      // Back to the stalled capture for the screenshot.
      await page.keyboard.press('ArrowRight');
      await note.waitFor({ timeout: 12_000 });
      return { notes: [`note after ${after} ms: "${text}"`, `link out ${href}`, 'slow (2.5 s) frame: silhouette until load, then the page'] };
    },
  },
  {
    name: 'live-visual-slow-320',
    shot: 'live-visual-slow',
    suffix: '-320',
    description: 'At 320 px, the "still loading" note sits below the picture, fully visible, clear of the Before / After chips, in one note region for the pane',
    viewports: ['mobile'],
    async run({ page, baseUrl }) {
      await page.setViewportSize({ width: 320, height: 640 });
      const latest = buildTimeline(git.url, git.pages).entries.at(-1)!.to;
      await mockApi(page, { frame: (ts) => (ts === latest ? null : 0) });
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      const note = page.locator('.lf-note p');
      await note.waitFor({ timeout: 12_000 });
      await note.scrollIntoViewIfNeeded();
      const r = await note.evaluate((p) => {
        const box = (el: Element) => JSON.parse(JSON.stringify(el.getBoundingClientRect())) as DOMRect;
        const n = box(p);
        const hit = (x: number, y: number) => p.contains(document.elementFromPoint(x, y));
        return {
          note: n,
          mat: box(p.closest('.vp-mat')!),
          shot: box(document.querySelector('.lf')!),
          chips: [...document.querySelectorAll('.vp-label')].map(box),
          clipped: p.scrollWidth > p.clientWidth || p.scrollHeight > p.clientHeight,
          // Every corner (2 px in) is the note itself: nothing paints over it.
          covered: ![[n.left + 2, n.top + 2], [n.right - 2, n.top + 2], [n.left + 2, n.bottom - 2], [n.right - 2, n.bottom - 2]].every(([x, y]) => hit(x!, y!)),
          notes: document.querySelectorAll('.lf-note').length,
        };
      });
      const meets = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
      if (r.note.left < 0 || r.note.right > 320 || !inside(r.note, r.mat) || r.clipped || r.covered) throw new Error(`note not fully visible at 320 px: ${JSON.stringify(r)}`);
      if (r.note.top < r.shot.bottom) throw new Error(`note overlaps the picture: ${JSON.stringify(r)}`);
      if (r.chips.some((c) => meets(c, r.note))) throw new Error(`a chip covers the note: ${JSON.stringify(r)}`);
      if (r.notes !== 1) throw new Error(`${r.notes} "still loading" regions, expected 1`);
      return { notes: [`note ${Math.round(r.note.left)}-${Math.round(r.note.right)} px wide, below the picture (${Math.round(r.note.top)} >= ${Math.round(r.shot.bottom)}), clear of ${r.chips.length} chip(s), 1 region`] };
    },
  },
  {
    name: 'live-visual-compare',
    description: 'Slider compare in a live run: two replay frames, both inert (focus never enters an archived page); the divider works from the keyboard',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await mockApi(page);
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      await openDisclosure(page, 'Compare');
      await page.getByRole('radio', { name: 'Slider' }).check();
      await page.locator('.vp-cmp iframe[data-loaded]').nth(1).waitFor({ timeout: 5000 });
      const frames = await page.locator('iframe').evaluateAll((els) => els.map((el) => (el as HTMLIFrameElement).inert));
      if (frames.length !== 2 || frames.some((i) => !i)) throw new Error(`iframes inert: ${JSON.stringify(frames)}`);
      const tabbing = await expectFramesNotTabbable(page);
      const split = page.getByRole('slider', { name: 'Divider between Before and After' });
      await split.focus();
      await page.keyboard.press('ArrowLeft');
      const v = await split.getAttribute('aria-valuenow');
      if (v !== '45') throw new Error(`divider at ${v} after ArrowLeft`);
      if (!page.url().includes('view=slider')) throw new Error(`address bar ${page.url()}`);
      const painted = await framesPainted(page, '.vp-cmp');
      return { notes: [tabbing, `divider 45 after ArrowLeft`, `deep link ${page.url()}`, painted] };
    },
  },
  {
    name: 'live-filmstrip-silhouettes',
    shot: 'live-filmstrip',
    description: 'The live filmstrip draws text silhouettes: no image requests; arrows + Enter show a capture',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const images: string[] = [];
      await mockApi(page);
      // From the start of the run (the sample first view's own pictures before it do not count).
      await openLive(page, baseUrl, 'git-scm.com');
      page.on('request', (r) => r.resourceType() === 'image' && images.push(r.url()));
      await page.locator('[data-live="done"]').waitFor({ timeout: 20_000 });
      if (await page.locator('.film-strip img').count()) throw new Error('<img> thumbnails in the live filmstrip');
      const n = await page.locator('.film-strip .sil').count();
      if (n !== 14) throw new Error(`${n} silhouettes, expected 14`);
      const hint = await expectText(page, '#film-hint', /Thumbnails are text outlines of each capture, not pictures\./);
      await page.locator('.film-strip [aria-current="true"]').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      const current = (await page.locator('.film-strip [aria-current="true"] .frame-cap').innerText()).replace(/\s+/g, ' ');
      if (!current.startsWith('Frame #01')) throw new Error(`after Home + Enter: ${current}`);
      if (images.length) throw new Error(`${images.length} image requests: ${images.join(', ')}`);
      return { notes: [`${n} silhouettes, 0 image requests`, hint, `Home + Enter -> ${current.replace(/\s+/g, ' ')}`] };
    },
  },
];

/**
 * A git-scm run with mocked Workers AI lines: asked for every 4 changes and at the end (<= 8 pairs, never twice); the
 * text swaps in labelled "AI summary", focus stays put, and no live region mentions it.
 */
async function aiSummaries({ page, baseUrl }: { page: Page; baseUrl: string }) {
  const api = await mockApi(page, { summaries: 'ai' });
  await openLive(page, baseUrl, 'git-scm.com');
  await page.evaluate(() => {
    const w = window as unknown as { live: string[] };
    w.live = [];
    for (const r of document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')) {
      new MutationObserver(() => w.live.push(r.textContent ?? '')).observe(r, { childList: true, characterData: true, subtree: true });
    }
  });
  await page.locator('[data-live="done"]').waitFor({ timeout: 20_000 });
  const prev = page.getByRole('button', { name: 'Previous' });
  await prev.focus();
  // textContent: the label is uppercased by CSS, which innerText would report.
  const last = `${GIT_AI_SUMMARIES.at(-1)} AI summary`;
  const read = (want: string) => document.querySelector('.panel-summary')?.textContent?.replace(/\s+/g, ' ').trim() === want;
  await page.waitForFunction(read, last, { timeout: 10_000 });
  const listed = await page.locator('.changes .change-sum').evaluateAll((els) => els.map((e) => e.textContent));
  if (listed.join('|') !== GIT_AI_SUMMARIES.join('|')) throw new Error(`list shows ${listed.join(' | ')}`);
  if (!(await prev.evaluate((el) => el === document.activeElement))) throw new Error(`focus moved to ${await focusAt(page)}`);
  await sleep(2500); // past the progress announcer's 2 s throttle, so a late update would be caught
  const said = await page.evaluate(() => (window as unknown as { live: string[] }).live);
  if (said.some((t) => GIT_AI_SUMMARIES.some((l) => t.includes(l)))) throw new Error(`a live region read an AI line: ${said.join(' | ')}`);
  await page.evaluate(() => scrollTo(0, 0)); // the runner's `clip` box is measured from the top of the page
  const asked = api.sums().map((l) => l.pairs ?? []);
  const all = asked.flat();
  if (asked.some((p) => p.length > 8) || new Set(all).size !== all.length || all.length !== gitEntries) throw new Error(`summary requests ${JSON.stringify(asked)}`);
  return { notes: [`summary requests (pairs each): ${asked.map((p) => p.length).join(', ')}`, `panel: "${last}"`, `focus kept on Previous; ${said.length} live-region updates, none with AI text`] };
}

export const summaryFlows: readonly Flow[] = [
  { name: 'live-summary-ai', shot: 'summary-ai', description: 'Mocked /api/summaries: AI lines swap in, labelled, batched, no focus move or chatter', viewports: ['desktop'], run: aiSummaries },
  { name: 'live-summary-label', shot: 'summary-label', description: 'The "AI summary" text label on a phone', viewports: ['mobile'], clip: '.change-panel', run: aiSummaries },
  {
    name: 'live-summary-fallback',
    shot: 'summary-fallback',
    apiErrors: true,
    description: '/api/summaries answers 500: rule summaries stay, labelled "auto summary", and no error shows',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const api = await mockApi(page, { summaries: 'error' });
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      for (let i = 0; i < 40 && api.sums().some((l) => !l.end); i++) await sleep(100);
      await sleep(300);
      if (!api.sums().length) throw new Error('no /api/summaries request');
      const want = `${gitTimeline.at(-1)!.ruleSummary} auto summary`;
      const shown = (await page.locator('.panel-summary').textContent())?.replace(/\s+/g, ' ').trim();
      if (shown !== want) throw new Error(`panel "${shown}", expected "${want}"`);
      const alerts = (await page.locator('[role="alert"]').allTextContents()).filter((t) => t.trim());
      if (alerts.length || (await page.locator('[data-error], [data-live="error"]').count())) throw new Error(`error UI after a failed summaries request ${alerts}`);
      return { notes: [`${api.sums().length} summary requests answered 500`, `panel: "${want}"`, 'no error UI'] };
    },
  },
];
