// Flow registry for scripts/smoke.ts. Each flow runs once per viewport in a
// fresh browser context; the runner takes the screenshot after `run` resolves.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright-core';
import { ARCHIVES } from '../src/archive/archives.ts';
import { describeChange, shownSummary } from '../src/app/describe.ts';
import { collapseUnchanged } from '../src/app/diff/rows.ts';
import { stepIndex, tsToMs } from '../src/app/timeline/scale.ts';
import { fixtureToSnapshots, parseSampleFixture } from '../src/core/fixture.ts';
import { namedSections } from '../src/core/ruleSummary.ts';
import { buildTimeline, trivialEntries } from '../src/core/timeline.ts';
import { formatTimestampLong, formatTimestampMonth, formatTimestampShort, timestampToIso } from '../src/core/timestamp.ts';
import { viewCaptureUrl } from '../src/core/url.ts';
import { type Theme, palette } from '../src/design/palette.ts';
import { changeForCapture, overviewPair, shotAlt, shotSrc, splitText } from '../src/app/visual/visualState.ts';
import { PLAY_MS } from '../src/app/visual/usePlay.ts';
import { isRecorded, readSampleConfig, recordedSamples } from './lib/sampleConfig.ts';

export interface FlowContext {
  page: Page;
  baseUrl: string;
  viewport: 'desktop' | 'mobile' | 'wide';
  scheme: Theme;
}

export interface FlowResult {
  /** Milliseconds from navigation start to `data-ready="true"`. */
  timeToReadyMs?: number;
  notes?: string[];
}

export interface Flow {
  name: string;
  description: string;
  /** Self-test flows only run when named explicitly with `--flows`. */
  selfTest?: boolean;
  /** Review-only flows that build their own markup with inline styles run without the page's CSP. */
  bypassCsp?: boolean;
  /** Colour schemes to run in (default: light only). */
  schemes?: Theme[];
  /** Screenshot base name (default: the flow name). */
  shot?: string;
  /** Screenshot name suffix, e.g. `-kbd`. */
  suffix?: string;
  /** With `--cvd`, also capture protan/deutan/tritan/gray variants. */
  cvd?: boolean;
  /** Screenshot only this element instead of the full page. */
  clip?: string;
  /** The flow mocks API error answers: Chrome's "Failed to load resource" console errors for `/api/*` are expected. */
  apiErrors?: boolean;
  /** Name shots by viewport width (`hero-1440`), not by viewport name. */
  widthTag?: boolean;
  /** Shoot what is on screen (the first viewport, or where the flow scrolled to), not the full page. */
  firstView?: boolean;
  /** Viewports to run in (default: desktop and mobile; `wide` is 1440×900). */
  viewports?: FlowContext['viewport'][];
  run: (ctx: FlowContext) => Promise<FlowResult>;
}

const root = fileURLToPath(new URL('..', import.meta.url));
/** The default sample (the first recorded entry of samples.config.json, Wikipedia): what a workspace flow opens unless it names another. */
const DEFAULT_ID = recordedSamples(root)[0]!.id;

/**
 * Opens the workspace at `path` and waits until the app reports ready; returns time-to-ready. A path that names no
 * sample and no page would show the hero, so it opens the default sample explicitly (`?sample=<id>` first).
 */
export async function openReady(page: Page, baseUrl: string, path = '/'): Promise<number> {
  const url = new URL(path, baseUrl);
  if (!url.searchParams.has('sample') && !url.searchParams.has('url')) url.search = `?sample=${DEFAULT_ID}${url.search.replace(/^\?/, '&')}`.replace(/&$/, '');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-ready="true"]', { timeout: 10_000 });
  return page.evaluate(() => {
    const mark = performance.getEntriesByName('wd:ready')[0];
    return Math.round(mark ? mark.startTime : performance.now());
  });
}

/** Opens the hero (`/`, no sample, no page) and waits for its deck to be dealt. */
export async function openHero(page: Page, baseUrl: string): Promise<void> {
  await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.deck-card').first().waitFor({ timeout: 10_000 });
}

const readJson = (rel: string) => JSON.parse(readFileSync(new URL(`../src/samples/${rel}`, import.meta.url), 'utf8'));
/** Committed samples in registry order (samples.config.json, recorded entries only: the app offers no other); the first is the default. */
const fixtures = recordedSamples(root).map((c) => parseSampleFixture(readJson(`${c.id}.json`)));
const defaultFixture = fixtures[0]!;
type Fixture = (typeof fixtures)[number];
const timelineOf = (f: Fixture) => buildTimeline(f.url, fixtureToSnapshots(f));
const defaultTimeline = timelineOf(defaultFixture);
const slider = (page: Page) => page.locator('.rb-slider');
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));

/** The slider value, its valuetext and the single `aria-current` row of Every change (newest first) all point at change `i` of `f`. */
async function expectSelected(page: Page, f: Fixture, i: number): Promise<string> {
  const { entries } = timelineOf(f);
  const want = describeChange(entries[i]!, i, entries.length);
  await page.locator(`.rb-slider[aria-valuenow="${i + 1}"]`).waitFor({ timeout: 2_000 });
  const text = await slider(page).getAttribute('aria-valuetext');
  if (text !== want) throw new Error(`valuetext "${text}", expected "${want}"`);
  const current = await page.locator('.changes .change').evaluateAll((bs) => bs.flatMap((b, j) => (b.getAttribute('aria-current') === 'true' ? [bs.length - 1 - j] : [])));
  if (current.join() !== String(i)) throw new Error(`list aria-current at change [${current.join()}], expected ${i}`);
  return want;
}

/** Centre of change `i`'s bar (or dot), scrolled into view inside the ribbon unless `scroll` is false. */
async function barAt(page: Page, i: number, scroll = true): Promise<{ x: number; y: number }> {
  const m = page.locator(`.rb-slider [data-index="${i}"]`);
  if (scroll) await m.scrollIntoViewIfNeeded();
  const b = (await m.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function noPageOverflow(page: Page): Promise<void> {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (wide > 0) throw new Error(`page scrolls sideways by ${wide}px (only the ribbon may)`);
}

/** The pane shows capture `ts` of `f` (its picture, or the "no picture" card), and the ribbon marks that thumbnail. */
async function expectShown(page: Page, f: Fixture, ts: string): Promise<void> {
  const file = f.snapshots.find((s) => s.ts === ts)?.shot?.file;
  const srcs = await page.locator('.vp-shot').evaluateAll((els) => els.map((e) => e.getAttribute('src')));
  if (!srcs.includes(file ? shotSrc(f.id, file) : null)) throw new Error(`pane shows ${srcs.join(', ')}, expected the picture of ${ts}`);
  const current = await page.locator('.rb-th[aria-current="true"]').getAttribute('data-ts');
  if (current !== ts) throw new Error(`ribbon marks ${current}, expected ${ts}`);
}

/** The default sample's first view: the decade compare, its first complete capture against its latest (D-phase 19). */
const hero = (() => {
  const { from, to } = overviewPair(defaultFixture.snapshots)!;
  return { from, to };
})();
const picOf = (ts: string) => shotSrc(defaultFixture.id, defaultFixture.snapshots.find((s) => s.ts === ts)!.shot!.file!);
const checkedMode = (page: Page) => page.locator('input[name="vp-mode"]:checked').getAttribute('value');

/**
 * Slider mode on the default sample's first view (the decade compare): Before under After, both tagged by dot, word and date in
 * their own corner, After clipped at `v`%, and the divider's value and valuetext say so.
 */
async function expectSlider(page: Page, v: number): Promise<string> {
  // Keys and clicks glide the divider for 250 ms; measure where it lands.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const m = await page.evaluate(() => ({
    srcs: [...document.querySelectorAll('.vp-cmp .vp-shot')].map((i) => [i.getAttribute('src'), i.getAttribute('alt')]),
    labels: [...document.querySelectorAll('.vp-label')].map((l) => [l.getAttribute('data-side'), l.textContent, Math.round(l.getBoundingClientRect().left)]),
    clip: getComputedStyle(document.querySelector('.vp-clip')!).clipPath,
    now: document.querySelector('.vp-split')?.getAttribute('aria-valuenow'),
    text: document.querySelector('.vp-split')?.getAttribute('aria-valuetext'),
  }));
  const { from, to } = hero;
  const want = [[picOf(from), shotAlt(defaultFixture.label, hero, from)], [picOf(to), shotAlt(defaultFixture.label, hero, to)]];
  const problems = [
    (await checkedMode(page)) !== 'slider' && 'Slider is not the checked mode',
    JSON.stringify(m.srcs) !== JSON.stringify(want) && `pictures ${JSON.stringify(m.srcs)}`,
    (m.labels[0]?.[0] !== 'before' || m.labels[0][1] !== `Before ${formatTimestampShort(from)}`) && `before tag ${m.labels[0]}`,
    (m.labels[1]?.[0] !== 'after' || m.labels[1][1] !== `After ${formatTimestampShort(to)}`) && `after tag ${m.labels[1]}`,
    Number(m.labels[0]?.[2]) >= Number(m.labels[1]?.[2]) && 'Before is not left of After',
    m.now !== String(v) && `divider at ${m.now}, expected ${v}`,
    m.text !== splitText(v, hero) && `valuetext "${m.text}"`,
    // The divider follows a pointer 1:1, so a drag may land a fraction of a percent off.
    !(Math.abs(Number(/ ([\d.]+)%\)$/.exec(m.clip)?.[1]) - v) <= 0.5) && `After clipped by "${m.clip}", expected ${v}%`,
  ].filter(Boolean);
  if (problems.length) throw new Error(problems.join('; '));
  return `${m.text}; clip ${m.clip}`;
}

/** Index of the capture the ribbon marks as shown. */
const shownIndex = (page: Page) => page.locator('.rb-th').evaluateAll((fs) => fs.findIndex((f) => f.getAttribute('aria-current') === 'true'));

/**
 * Picks sample `f` (not the open one) in the address field's menu by keyboard: focus opens it, arrows reach `f`,
 * Enter picks it; then the checked option, heading and capture links all follow.
 */
async function switchTo(page: Page, f: (typeof fixtures)[number]): Promise<string> {
  const option = page.locator(`#addr-menu [data-sample="${f.id}"]`);
  if ((await option.getAttribute('aria-selected')) !== 'false') throw new Error(`${f.id}: already the checked sample`);
  // Focus arriving (not focus kept from the last pick) opens the menu.
  await page.locator('#url-input').evaluate((el) => el.blur());
  await page.locator('#url-input').focus();
  if ((await page.locator('#url-input').getAttribute('aria-expanded')) !== 'true') throw new Error('focus did not open the samples menu');
  const want = await option.getAttribute('id');
  for (let i = 0; i < fixtures.length && (await page.locator('#url-input').getAttribute('aria-activedescendant')) !== want; i++) await page.keyboard.press('ArrowDown');
  if ((await page.locator('#url-input').getAttribute('aria-activedescendant')) !== want) throw new Error(`arrows never reached ${f.id}`);
  await page.keyboard.press('Enter');
  await page.locator('#sample-label', { hasText: f.label }).waitFor({ timeout: 2_000 });
  await page.waitForSelector('[data-ready="true"]');
  if ((await option.getAttribute('aria-selected')) !== 'true') throw new Error(`${f.id}: not checked after Enter`);
  // Let any picture fade finish so axe measures settled colours.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  return checkSample(page, f);
}

/** The shown sample's heading, capture count, archive links and provenance match its fixture. */
async function checkSample(page: Page, f: (typeof fixtures)[number]): Promise<string> {
  const checked = await page.locator('#addr-menu [aria-selected="true"]').evaluateAll((os) => os.map((o) => o.getAttribute('data-sample')));
  if (checked.join() !== f.id) throw new Error(`checked samples in the menu: [${checked.join()}], expected ${f.id}`);
  const heading = (await page.locator('#sample-label').textContent())?.trim();
  if (heading !== f.label) throw new Error(`heading "${heading}", expected "${f.label}"`);
  const links = await page.locator('.cap-link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  const replay = ARCHIVES[f.source.archive].replay;
  if (links.length !== f.snapshots.length || links.some((h) => !h.startsWith(replay))) {
    throw new Error(`${f.id}: ${links.length} capture links, expected ${f.snapshots.length} into ${replay}`);
  }
  if ((await page.locator('.changes li').count()) < 4) throw new Error(`${f.id}: fewer than 4 meaningful changes listed`);
  const footer = (await page.locator('.site-footer').textContent()) ?? '';
  if (!footer.includes(f.source.license) || !footer.includes(f.source.recordedAt)) throw new Error(`${f.id}: footer lacks provenance`);
  return `${f.id}: ${f.snapshots.length} captures linked to ${replay}`;
}

/**
 * The list's `aria-current` change sits in Every change, after the timeline and the change, which never scrolls
 * inside a box of its own (so no change is clipped there); the page itself has not scrolled from `pageY`.
 */
async function currentInList(page: Page, pageY = 0): Promise<string> {
  const m = await page.evaluate((y) => {
    const pane = document.querySelector<HTMLElement>('.stage .every')!;
    const item = document.querySelector('.changes .change[aria-current="true"]')!.getBoundingClientRect();
    const box = pane.getBoundingClientRect();
    const tl = document.querySelector('.stage .rb')!.getBoundingClientRect();
    const boxes = [pane, ...pane.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY));
    const problems = [
      boxes.length > 0 && `${boxes.length} scroll boxes inside the list`,
      box.top < tl.bottom - 0.5 && 'the list is not below the timeline',
      (item.top < box.top - 0.5 || item.bottom > box.bottom + 0.5) && 'the selected change is outside the list box',
      scrollY !== y && `the page scrolled to ${scrollY}`,
    ].filter(Boolean);
    return { problems, text: `item ${Math.round(item.top)}-${Math.round(item.bottom)} in list ${Math.round(box.top)}-${Math.round(box.bottom)}, page scrollY ${scrollY}` };
  }, pageY);
  if (m.problems.length) throw new Error(`${m.problems.join('; ')}: ${m.text}`);
  return m.text;
}

const SPOKEN: Record<string, string> = { added: 'Added:', removed: 'Removed:', modified: 'Changed:', moved: 'Moved:' };

/**
 * The diff of change `i` reads "Added: …" / "Removed: …" / "Changed: …" in document order (after "Show n more changes"),
 * every block marked by its symbol and every word by its line, not hue.
 */
async function checkDiff(page: Page, f: Fixture, i: number): Promise<string[]> {
  const e = timelineOf(f).entries[i]!;
  const more = page.locator('.db-more .btn');
  const shownFirst = await page.locator('.diff-body .sr-only').count();
  if (await more.count()) await more.click();
  const want = collapseUnchanged(e.diff.ops).flatMap((r) => ('op' in r && r.op.type !== 'equal' ? [SPOKEN[r.op.type] ?? r.op.type] : []));
  const got = await page.locator('.diff-body .sr-only').allTextContents();
  if (got.map((t) => t.trim()).join() !== want.join()) throw new Error(`diff prefixes ${got.join()} != ${want.join()}`);
  const bad = await page.evaluate(() => {
    const line = (sel: string, want: string) => [...document.querySelectorAll(sel)].filter((el) => !getComputedStyle(el).textDecorationLine.includes(want)).map(() => sel);
    const sym = [...document.querySelectorAll('.diff-body .db:not([data-op="equal"])')].filter((el) => getComputedStyle(el, '::before').content === 'none');
    return [...line('.diff-body ins', 'underline'), ...line('.diff-body del', 'line-through'), ...sym.map(() => 'gutter')];
  });
  if (bad.length) throw new Error(`marks without symbol/line style: ${bad.join(', ')}`);
  const links = await page.locator('.cs-links a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel'), a.textContent]));
  const hrefs = [e.from, e.to].map((ts) => viewCaptureUrl(f.source.archive, ts, f.url));
  links.forEach(([href, target, rel, text], k) => {
    if (href !== hrefs[k] || target !== '_blank' || rel !== 'noopener noreferrer' || !text?.includes(formatTimestampLong(k ? e.to : e.from))) throw new Error(`capture link ${k}: ${href} ${target} ${rel} "${text}"`);
  });
  if (links.length !== 2) throw new Error(`${links.length} capture links in the change section`);
  // What a screen reader gets: the accessibility tree of the diff, in document order.
  const tree = (await page.locator('.diff-body').ariaSnapshot()).split('\n').map((l) => l.replace(/^[\s-]*(?:(?:paragraph|blockquote|code|text):)?\s*"?/, '').replace(/"$/, ''));
  const spoken = tree.filter((l) => /^(Added|Removed|Changed|Moved):/.test(l));
  if (spoken.map((l) => l.split(':')[0]).join() !== want.map((w) => w.slice(0, -1)).join()) throw new Error(`a11y tree reads ${spoken.join(' | ')}`);
  return [`${want.length} marked blocks in order (${shownFirst} before "Show more changes"); a11y dump: ${spoken.map((l) => l.slice(0, 60)).join(' | ')}`];
}

export const flows: readonly Flow[] = [
  {
    name: 'sample-default',
    description: 'First load renders the default sample (dates, theme, self-hosted fonts)',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl, scheme }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      for (const { to: ts } of defaultTimeline.entries) {
        const time = page.locator(`.changes time[datetime="${timestampToIso(ts)}"]`).first();
        await time.waitFor({ state: 'visible', timeout: 2_000 });
        const shown = (await time.locator('[aria-hidden="true"]').textContent())?.trim();
        const spoken = (await time.locator('.sr-only').textContent())?.trim();
        if (shown !== formatTimestampMonth(ts) || spoken !== formatTimestampLong(ts)) {
          throw new Error(`change ${ts}: got "${shown}" / "${spoken}"`);
        }
      }
      const { bg, fonts } = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = [...document.fonts].filter((f) => f.status === 'loaded');
        return { bg: getComputedStyle(document.body).backgroundColor, fonts: loaded.map((f) => `${f.family} ${f.style}`) };
      });
      const ground = palette[scheme].bg.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16));
      if (bg !== `rgb(${ground.join(', ')})`) throw new Error(`${scheme}: body background ${bg}, expected ${palette[scheme].bg}`);
      const families = new Set(fonts.map((f) => f.replace(/ (normal|italic)$/, '')));
      if (!families.has('Schibsted Grotesk') || !families.has('IBM Plex Mono')) throw new Error(`self-hosted fonts not loaded (loaded: ${fonts.join(', ') || 'none'})`);
      return { timeToReadyMs, notes: [`${defaultTimeline.entries.length} change dates visible`, `${scheme} ground ${bg}`, `fonts: ${fonts.join(', ')}`] };
    },
  },
  {
    name: 'samples-switch',
    description: 'Each sample, picked from the address menu by keyboard, switches the checked option, heading, capture links and footer',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const notes = [await checkSample(page, defaultFixture)];
      // Visit every other sample, then come back to the default: every pick is of a sample not open yet.
      for (const f of [...fixtures.slice(1), defaultFixture]) notes.push(await switchTo(page, f));
      return { notes };
    },
  },
  ...fixtures.map(
    (f): Flow => ({
      name: `sample-${f.id}`,
      description: `The ${f.id} sample renders from its bundled fixture`,
      async run({ page, baseUrl }) {
        const timeToReadyMs = await openReady(page, baseUrl, `/?sample=${f.id}`);
        return { timeToReadyMs, notes: [await checkSample(page, f)] };
      },
    }),
  ),
  {
    name: 'sample-unrecorded',
    description: 'A config entry without a recorded fixture (NASA, Creative Commons) is never offered: not a hero option, not in the address menu, and its deep link opens the default sample',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const unrecorded = readSampleConfig(root).flatMap((c) => (isRecorded(root, c.id) ? [] : [c.id]));
      if (!unrecorded.length) return { notes: ['every config entry is recorded: nothing to hide'] };
      const ids = fixtures.map((f) => f.id).join();
      await openHero(page, baseUrl);
      const options = await page.locator('.sample-opt').evaluateAll((bs) => bs.map((b) => b.getAttribute('data-sample')));
      if (options.join() !== ids) throw new Error(`hero options ${options.join()}, expected ${ids}`);
      const notes = [`hero options: ${options.join(', ')}`];
      for (const id of unrecorded) {
        await openReady(page, baseUrl, `/?sample=${id}`);
        const label = (await page.locator('#sample-label').textContent())?.trim();
        if (label !== defaultFixture.label) throw new Error(`?sample=${id} opened "${label}", expected the default "${defaultFixture.label}"`);
        if (new URL(page.url()).search !== `?sample=${DEFAULT_ID}`) throw new Error(`?sample=${id} not replaced by the default: ${page.url()}`);
        const menu = await page.locator('#addr-menu [data-sample]').evaluateAll((os) => os.map((o) => o.getAttribute('data-sample')));
        if (menu.join() !== ids) throw new Error(`address menu ${menu.join()}, expected ${ids}`);
        notes.push(`?sample=${id} -> ${page.url().split('/').at(-1)}; menu ${menu.join(', ')}`);
      }
      return { notes };
    },
  },
  {
    name: 'reduced-motion',
    description: 'Under prefers-reduced-motion: reduce, every transition and animation computes to 0s',
    shot: 'hero',
    suffix: '-reduced',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const moving = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('*')].flatMap((el) => {
            const cs = getComputedStyle(el);
            const durations = `${cs.transitionDuration},${cs.animationDuration}`.split(',');
            return durations.some((d) => parseFloat(d) > 0) ? [`${el.tagName.toLowerCase()}.${el.classList[0] ?? ''}`] : [];
          }),
        );
      const before = await moving();
      if (before.length === 0) throw new Error('no animated elements with motion allowed: the check would be vacuous');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const after = await moving();
      if (after.length) throw new Error(`still animated under reduce: ${after.join(', ')}`);
      const scroll = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
      if (scroll !== 'auto') throw new Error(`scroll-behavior is ${scroll} under reduce`);
      return { notes: [`${before.length} animated elements (${[...new Set(before)].join(', ')}) all 0s under reduce`] };
    },
  },
  {
    name: 'keyboard-tab-order',
    description: 'Workspace Tab order header (address field, button) -> content -> footer, a visible ring on every stop',
    suffix: '-kbd',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const regions = ['header', 'main', 'footer'];
      const stops: { region: string; name: string; ring: boolean }[] = [];
      for (let i = 0; i < 100; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          // The address field draws its ring on the field around the input, the slider divider on its knob, the ribbon's
          // slider on the ribbon's ring overlay (`.rb:has(.rb-slider:focus-visible) > .rb-ring`).
          const overlay = el.matches('.rb-slider') ? el.closest('.rb')?.querySelector(':scope > .rb-ring') : null;
          const ringed = el.id === 'url-input' ? el.closest('.addr-field')! : (overlay ?? el.querySelector(':scope.vp-split > .vp-knob') ?? el);
          const cs = getComputedStyle(ringed);
          const box = ringed.getBoundingClientRect();
          const region = el.closest('header, main, footer')?.tagName.toLowerCase() ?? 'other';
          const ring = cs.outlineStyle === 'solid' && parseFloat(cs.outlineWidth) >= 2 && box.width > 0 && box.height > 0;
          return { region, name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40), ring };
        });
        if (!stop) break;
        stops.push(stop);
        // The samples menu opened on focus closes when Tab leaves the field.
        if (stop.name === 'Show its history' && (await page.locator('#url-input').getAttribute('aria-expanded')) !== 'false') throw new Error('the samples menu stayed open after Tab left the field');
      }
      const order = stops.map((s) => regions.indexOf(s.region));
      if (order.some((r, i) => r < 0 || (i > 0 && r < order[i - 1]!)) || new Set(order).size !== regions.length) {
        throw new Error(`tab order: ${stops.map((s) => `${s.region}:${s.name}`).join(' | ')}`);
      }
      const head = stops.filter((s) => s.region === 'header').map((s) => s.name);
      if (head.join('|') !== 'Skip to content|Skip to diff|Pagelapse|Page address|Show its history|Source on GitHub') throw new Error(`header stops: ${head.join(' | ')}`);
      const ringless = stops.filter((s) => !s.ring);
      if (ringless.length) throw new Error(`no focus ring on: ${ringless.map((s) => s.name).join(', ')}`);
      return { notes: [`${stops.length} stops: ${stops.map((s) => `${s.region}:${s.name}`).join(' | ')}`] };
    },
  },
  {
    name: 'address-menu',
    description: 'The address field is a combobox: focus opens the samples (current one aria-selected), arrows move aria-activedescendant, Escape closes, Enter picks, Tab leaves',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const input = page.locator('#url-input');
      const state = () =>
        page.evaluate(() => {
          const i = document.querySelector('#url-input')!;
          return {
            role: i.getAttribute('role'),
            expanded: i.getAttribute('aria-expanded'),
            active: i.getAttribute('aria-activedescendant'),
            hidden: document.querySelector<HTMLElement>('.addr-menu')!.hidden === true,
            value: (i as HTMLInputElement).value,
            checked: [...document.querySelectorAll('#addr-menu [aria-selected="true"]')].map((o) => o.getAttribute('data-sample')),
          };
        });
      const want = (ok: boolean, what: string, got: unknown) => {
        if (!ok) throw new Error(`${what}: ${JSON.stringify(got)}`);
      };
      await noPageOverflow(page);
      const closed = await state();
      want(closed.role === 'combobox' && closed.expanded === 'false' && closed.hidden && closed.value === defaultFixture.url.replace(/^https?:\/\//, '').replace(/\/$/, ''), 'before focus', closed);
      await input.focus();
      const open = await state();
      want(open.expanded === 'true' && !open.hidden && open.active === null && open.checked.join() === defaultFixture.id, 'focus opens the menu, current sample checked', open);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      const moved = await state();
      want(moved.active === 'addr-opt-1', 'two ArrowDowns reach the second option', moved);
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      want((await state()).active === `addr-opt-${fixtures.length - 1}`, 'ArrowUp wraps to the last option', await state());
      await page.keyboard.press('Escape');
      const esc = await state();
      want(esc.expanded === 'false' && esc.hidden && (await input.evaluate((el) => el === document.activeElement)), 'Escape closes, focus stays in the field', esc);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      const f = fixtures[1]!;
      await page.locator('#sample-label', { hasText: f.label }).waitFor({ timeout: 3_000 });
      const picked = await state();
      want(picked.expanded === 'false' && picked.checked.join() === f.id && page.url().includes(`sample=${f.id}`), 'Enter picks the option', { ...picked, url: page.url() });
      await input.focus();
      await page.keyboard.press('Tab');
      const left = await state();
      want(left.expanded === 'false' && left.hidden, 'Tab leaves and closes the menu', left);
      return { notes: [`checked ${closed.checked.join()} -> picked ${f.id} by keyboard`, 'focus opens, arrows wrap, Escape closes, Enter picks, Tab leaves'] };
    },
  },
  {
    name: 'hero',
    description: 'No sample or page in the address: the hero (headline, field, sample options, deck); options and deck cards open the workspace with a history entry, Back returns to the hero',
    schemes: ['light', 'dark'],
    firstView: true,
    async run({ page, baseUrl, viewport }) {
      await openHero(page, baseUrl);
      const notes: string[] = [];
      const h1 = (await page.locator('h1').textContent())?.trim();
      if (h1 !== 'See how any web page changed over the years') throw new Error(`h1 "${h1}"`);
      if ((await page.getByRole('textbox', { name: 'Page address' }).count()) !== 1) throw new Error('no "Page address" field');
      if ((await page.getByRole('button', { name: 'Show its history' }).count()) !== 1) throw new Error('no "Show its history" button');
      const options = await page.locator('.sample-opt').evaluateAll((bs) => bs.map((b) => b.getAttribute('data-sample')));
      if (options.join() !== fixtures.map((f) => f.id).join()) throw new Error(`sample options ${options.join()}`);
      await noPageOverflow(page);
      // The deck: one button per pictured Wikipedia capture, named by its date.
      const deck = fixtures.find((f) => f.id === 'wikipedia-internet-archive')!;
      const shots = deck.snapshots.filter((s) => s.shot?.file);
      const cards = await page.locator('.deck-card').evaluateAll((bs) => bs.map((b) => [b.tagName, b.getAttribute('aria-label')]));
      const names = shots.map((s, i) => `${i === shots.length - 1 ? 'Latest, ' : ''}${formatTimestampLong(s.ts)}, open this capture`);
      if (JSON.stringify(cards) !== JSON.stringify(names.map((n) => ['BUTTON', n]))) throw new Error(`deck cards ${JSON.stringify(cards)}`);
      notes.push(`${cards.length} deck cards, ${await page.locator('.deck-bar').count()} change bars`);
      // Tab: field, button, the options, then every card in time order.
      await page.locator('#url-input').focus();
      const stops: string[] = [];
      for (let i = 0; i < 2 + options.length + shots.length; i++) {
        stops.push(await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '').trim()));
        await page.keyboard.press('Tab');
      }
      const wantStops = ['Page address', 'Show its history', ...fixtures.map((f) => f.label.replace(/ home page$/, '')), ...names];
      if (stops.join('|') !== wantStops.join('|')) throw new Error(`hero tab stops: ${stops.join(' | ')}`);
      // A sample option opens the workspace in a new history entry; Back returns to the hero.
      const before = await page.evaluate(() => history.length);
      const other = fixtures[2]!;
      await page.locator(`.sample-opt[data-sample="${other.id}"]`).click();
      await page.locator('#sample-label', { hasText: other.label }).waitFor({ timeout: 3_000 });
      const pushed = await page.evaluate(() => history.length);
      if (!page.url().endsWith(`/?sample=${other.id}`) || pushed !== before + 1) throw new Error(`option: ${page.url()}, history ${before} -> ${pushed}`);
      await page.goBack();
      await page.locator('.intro-head').waitFor({ timeout: 3_000 });
      notes.push(`option ${other.id} pushed ${page.url()} -> Back to the hero`);
      // A deck card opens Wikipedia on that capture: the change that ends there.
      const k = 3;
      // By keyboard: the cards overlap, so a pointer reaches most of them only by their slivers.
      await page.locator('.deck-card').nth(k).focus();
      await page.keyboard.press('Enter');
      await page.locator('#sample-label', { hasText: deck.label }).waitFor({ timeout: 3_000 });
      await page.waitForSelector('[data-ready="true"]');
      const e = timelineOf(deck).entries[changeForCapture(timelineOf(deck).entries, shots[k]!.ts)]!;
      if (!page.url().includes(`sample=${deck.id}&change=${e.from}-${e.to}`)) throw new Error(`card ${k}: ${page.url()}, expected change ${e.from}-${e.to}`);
      if ((await page.evaluate(() => document.activeElement?.id)) !== 'content') throw new Error('focus is not on the content after opening a card');
      await page.goBack();
      await page.locator('.intro-head').waitFor({ timeout: 3_000 });
      notes.push(`card ${formatTimestampShort(shots[k]!.ts)} opened change ${e.from}-${e.to}, focus on #content, Back to the hero`);
      await page.evaluate(() => scrollTo(0, 0));
      if (viewport === 'mobile') await noPageOverflow(page);
      return { notes };
    },
  },
  {
    name: 'open-transition',
    description:
      'Open: a sample option and a deck card (by pointer and by keyboard) grow into the stage as a 350 ms view transition (the field settles into the header); focus lands on the content; none under reduced motion or without the API; a press mid-transition lands where it was aimed',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      type Vt = { groups: string[]; ms: number[]; focus?: string };
      type W = { vts: Vt[]; running: boolean; downs: boolean[] };
      const notes: string[] = [];
      const cases = [
        ['option', 'pointer'],
        ['option', 'keyboard'],
        ['card', 'pointer'],
        ['card', 'keyboard'],
        ['option', 'reduce'],
        ['option', 'no API'],
        ['option', 'press the field'],
        ['option', 'press Play'],
        ['option', 'press Side by side'],
        ['option', 'drag from Play'],
        ['option', 'press the heading'],
      ] as const;
      // What each press mid-transition aims at.
      const AIM = {
        'press the field': '#url-input',
        'press Play': '.vp-play',
        'press Side by side': '.vp-mode[data-mode="side"]',
        'drag from Play': '.vp-play',
        'press the heading': '#content h2',
      } as const;
      for (const [what, how] of cases) {
        const name = `${what} (${how})`;
        await page.emulateMedia({ reducedMotion: how === 'reduce' ? 'reduce' : 'no-preference' });
        // Play sits below an 800 px viewport's fold; a press can only aim at what is on screen.
        await page.setViewportSize({ width: 1280, height: /Play|Side/.test(how) ? 1300 : 800 });
        await openHero(page, baseUrl);
        // Record each view transition: its named groups, their duration, and where focus is once it has finished; and
        // whether each press came while one ran.
        await page.evaluate((none) => {
          const w = window as unknown as W;
          w.vts = [];
          w.running = false;
          w.downs = [];
          addEventListener('pointerdown', () => w.downs.push(w.running), true);
          if (none) return void delete (Document.prototype as Partial<Document>).startViewTransition;
          const start = document.startViewTransition.bind(document);
          document.startViewTransition = ((cb: ViewTransitionUpdateCallback) => {
            const t = start(cb);
            const rec: Vt = { groups: [], ms: [] };
            w.vts.push(rec);
            // Running once its overlay is up (the update has rendered the workspace under it).
            void t.ready.then(() => {
              w.running = true;
              const anims = document.getAnimations().map((a) => a.effect as KeyframeEffect).filter((e) => e.pseudoElement?.startsWith('::view-transition-group'));
              rec.groups = anims.map((e) => /\((.*)\)/.exec(e.pseudoElement!)![1]!).sort();
              rec.ms = [...new Set(anims.map((e) => Number(e.getTiming().duration)))];
            }, () => undefined);
            void t.finished.then(() => {
              w.running = false;
              rec.focus = document.activeElement?.id;
            });
            return t;
          }) as typeof document.startViewTransition;
        }, how === 'no API');
        const press = how.startsWith('press') || how.startsWith('drag');
        // A press mid-transition: the animations run at a tenth of their speed, so the press surely lands inside one.
        const cdp = press ? await page.context().newCDPSession(page) : undefined;
        await cdp?.send('Animation.enable');
        await cdp?.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
        let hits = { clicks: 0, changes: 0 };
        if (what === 'option' && how === 'keyboard') {
          await page.locator('.sample-opt').first().focus();
          await page.keyboard.press('Enter');
        } else if (what === 'option') await page.locator('.sample-opt').first().click();
        else if (how === 'keyboard') {
          await page.locator('.deck-card').nth(3).focus();
          await page.keyboard.press('Enter');
        } else {
          // The cards overlap: press the first point on screen where a card (the top one first) is the one hit.
          const at = await page.locator('.deck-card').evaluateAll((cards) => {
            for (const c of cards.reverse()) {
              const r = c.getBoundingClientRect();
              for (let y = r.top + 8; y < Math.min(r.bottom, innerHeight); y += 16) {
                for (let x = r.left + 8; x < Math.min(r.right, innerWidth); x += 16) {
                  if (c.contains(document.elementFromPoint(x, y))) return { x, y };
                }
              }
            }
            return null;
          });
          if (!at) throw new Error('no deck card is on top anywhere on screen');
          await page.mouse.click(at.x, at.y);
        }
        if (press) {
          await page.waitForFunction(() => (window as unknown as W).running, null, { timeout: 10_000 });
          const aim = AIM[how as keyof typeof AIM];
          // Count the clicks the aimed element gets (the press's own goes to <html>) and its radio's changes.
          await page.evaluate((sel) => {
            const w = window as unknown as { hits: { clicks: number; changes: number } };
            w.hits = { clicks: 0, changes: 0 };
            const el = document.querySelector(sel)!;
            el.addEventListener('click', () => w.hits.clicks++);
            el.querySelector('input')?.addEventListener('change', () => w.hits.changes++);
          }, aim);
          const box = (await page.locator(aim).boundingBox())!;
          const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
          if (how === 'drag from Play') {
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 150, y, { steps: 5 });
            await page.mouse.up();
          } else await page.mouse.click(x, y);
          if (how === 'press the field') await page.keyboard.type('example.org');
          await page.waitForTimeout(300);
          hits = await page.evaluate(() => (window as unknown as { hits: { clicks: number; changes: number } }).hits);
          await cdp!.send('Animation.setPlaybackRate', { playbackRate: 1 });
          await cdp!.detach();
        }
        await page.waitForSelector('[data-ready="true"]');
        await page.waitForTimeout(600);
        const w = await page.evaluate(() => {
          const { vts, downs } = window as unknown as W;
          const input = document.querySelector<HTMLInputElement>('#url-input')!;
          const mode = document.querySelector<HTMLInputElement>('.vp-modes input:checked')?.value;
          return { vts, downs, focus: document.activeElement?.id, value: input.value, playing: document.querySelector('.vp-play')?.hasAttribute('data-playing'), mode };
        });
        const v = w.vts[0];
        if (press && !w.downs.at(-1)) throw new Error(`${name}: the press came after the transition (${JSON.stringify(w)})`);
        if (how === 'press the field') {
          if (w.focus !== 'url-input' || !w.value.endsWith('example.org')) throw new Error(`${name}: focus on #${w.focus}, field "${w.value}"`);
          notes.push(`${name} mid-transition: focus on #url-input, typing reached it ("${w.value}")`);
          continue;
        }
        if (how === 'press Play') {
          if (hits.clicks !== 1 || !w.playing) throw new Error(`${name}: ${hits.clicks} activations, playing ${w.playing}`);
          await page.keyboard.press('Escape'); // any key stops the time-lapse
          notes.push(`${name} mid-transition: exactly 1 activation, playing`);
          continue;
        }
        if (how === 'press Side by side') {
          const view = new URL(page.url()).searchParams.get('view');
          if (hits.changes !== 1 || w.mode !== 'side' || view !== 'side') throw new Error(`${name}: ${hits.changes} change events, mode ${w.mode}, view=${view}`);
          notes.push(`${name} mid-transition: checked, exactly 1 change event, view=side`);
          continue;
        }
        if (how === 'drag from Play') {
          if (hits.clicks !== 0 || w.playing) throw new Error(`${name}: ${hits.clicks} activations, playing ${w.playing}`);
          notes.push(`${name} 150 px right mid-transition: 0 activations, not playing`);
          continue;
        }
        if (how === 'press the heading') {
          if (hits.clicks !== 0) throw new Error(`${name}: ${hits.clicks} clicks forwarded to the heading`);
          notes.push(`${name} mid-transition: 0 clicks forwarded to it`);
          continue;
        }
        if (w.focus !== 'content') throw new Error(`${name}: focus on ${w.focus}, expected #content`);
        if (how === 'reduce' || how === 'no API') {
          if (w.vts.length) throw new Error(`${name}: a view transition ran: ${JSON.stringify(w.vts)}`);
          notes.push(`${name}: no view transition, the workspace at once, focus on #content`);
          continue;
        }
        if (w.vts.length !== 1 || v!.groups.join() !== 'pl-field,pl-stage,root' || v!.ms.join() !== '350' || v!.focus !== 'content') throw new Error(`${name}: ${JSON.stringify(w.vts)}`);
        notes.push(`${name}: groups ${v!.groups.join(', ')}, ${v!.ms.join()} ms, focus on #${v!.focus}`);
      }
      await page.setViewportSize({ width: 1280, height: 800 });
      return { notes };
    },
  },
  {
    name: 'timeline',
    description: 'Default sample ribbon: a thumbnail and hairline per capture, a bar per change (height from score), the pair ringed, latest change selected, SVG hidden',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl, viewport }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      const { entries, snapshots } = defaultTimeline;
      const said = await expectSelected(page, defaultFixture, entries.length - 1);
      const hs = await page.locator('.rb-bar').evaluateAll((bs) => bs.map((b) => Number(b.getAttribute('height'))));
      if (hs.length !== entries.length) throw new Error(`${hs.length} bars for ${entries.length} changes`);
      const bad = entries.filter((e, i) => Math.abs(hs[i]! - (6 + Math.sqrt(e.significance.score) * 38)) > 0.01);
      if (bad.length) throw new Error(`${bad.length} bars not 6 + sqrt(score) x 38 px tall`);
      if ((await page.locator('.rb-bar.is-sel').getAttribute('data-index')) !== String(entries.length - 1)) throw new Error('the selected bar is not the latest change');
      if ((await page.locator('.rb-first').count()) !== 1) throw new Error('no filled dot for the first capture');
      if ((await page.locator('.rb svg').getAttribute('aria-hidden')) !== 'true') throw new Error('ribbon SVG is not aria-hidden');
      // Phones show the axis only (target/V3WorkPhone.html); elsewhere a thumbnail and a hairline per capture, the pair ringed.
      const thumbs = await page.locator('.rb-th').count();
      const lines = await page.locator('.rb-cv').count();
      const sides = await page.locator('.rb-th[data-side]').evaluateAll((ts) => ts.map((t) => `${t.getAttribute('data-side')} ${t.getAttribute('aria-label')}`));
      if (viewport === 'mobile' ? thumbs + lines !== 0 : thumbs !== snapshots.length || lines !== snapshots.length) throw new Error(`${thumbs} thumbnails, ${lines} hairlines on ${viewport}`);
      if (viewport !== 'mobile' && (sides.length !== 2 || !sides[0]!.startsWith('before') || !sides[0]!.endsWith('Before') || !sides[1]!.endsWith('After'))) throw new Error(`pair rings: ${sides.join('; ')}`);
      await noPageOverflow(page);
      return { timeToReadyMs, notes: [`${hs.length} bars ${Math.min(...hs).toFixed(1)}-${Math.max(...hs).toFixed(1)} px, ${thumbs} thumbnails`, said] };
    },
  },
  {
    name: 'timeline-keyboard',
    description: 'Slider keys Home, Right x3, End, Home, PageUp move the selection; valuetext, list aria-current and URL follow',
    shot: 'timeline',
    suffix: '-kbd',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const { entries } = defaultTimeline;
      const pageUp = stepIndex('PageUp', 0, entries.map((e) => tsToMs(e.to)))!;
      const steps: [string, number][] = [['Home', 0], ['ArrowRight', 1], ['ArrowRight', 2], ['ArrowRight', 3], ['End', entries.length - 1], ['Home', 0], ['PageUp', pageUp]];
      await slider(page).focus();
      const said = new Set<string>();
      for (const [key, i] of steps) {
        await page.keyboard.press(key);
        said.add(await expectSelected(page, defaultFixture, i));
        const e = entries[i]!;
        if (new URL(page.url()).searchParams.get('change') !== `${e.from}-${e.to}`) throw new Error(`${key}: URL not updated (${page.url()})`);
      }
      if (said.size < 5) throw new Error('aria-valuetext did not change between steps');
      const tip = (await page.locator('.rb-tip').textContent()) ?? '';
      if (!tip.includes(entries[pageUp]!.ruleSummary)) throw new Error(`no focus tooltip for the selected change ("${tip}")`);
      // Escape dismisses the focus tooltip without moving the selection; the next key brings it back.
      await page.keyboard.press('Escape');
      await page.locator('.rb-tip').waitFor({ state: 'detached', timeout: 2_000 });
      await expectSelected(page, defaultFixture, pageUp);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await page.locator('.rb-tip').waitFor({ timeout: 2_000 });
      return { notes: [`${steps.map(([k, i]) => `${k}->${i + 1}`).join(', ')}; ${said.size} distinct valuetexts`] };
    },
  },
  {
    name: 'timeline-pointer',
    description: 'Clicking a bar selects it, a drag across every change follows the pointer on x and never flips, hovering shows the tooltip, a thumbnail click shows its capture',
    shot: 'timeline',
    suffix: '-tooltip',
    async run({ page, baseUrl, viewport }) {
      await openReady(page, baseUrl);
      await settle(page);
      const { entries } = defaultTimeline;
      const a = await barAt(page, 1);
      await page.mouse.click(a.x, a.y);
      await expectSelected(page, defaultFixture, 1);
      if (!(await slider(page).evaluate((el) => el === document.activeElement))) throw new Error('click did not focus the slider');
      // A captured drag snaps on x only: sweep left to right at one height, across every bar, high in the bend where
      // short bars are far away in 2D; the selection is always the bar nearest the pointer's x and only ever moves on.
      // Measure once the page has stopped scrolling.
      let top = -1;
      for (let k = 0; k < 30 && top !== (top = await page.evaluate(() => scrollY)); k++) await page.waitForTimeout(100);
      const xs = await page.locator('.rb-slider [data-index]').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return r.x + r.width / 2; }));
      const box = (await slider(page).boundingBox())!;
      const y = box.y + box.height * 0.45;
      await page.mouse.move(xs[0]! - 8, y);
      await page.mouse.down();
      const seen: number[] = [];
      for (let x = xs[0]! - 8; x <= xs.at(-1)! + 8; x += 3) {
        await page.mouse.move(x, y);
        const want = xs.reduce((b, c, i) => (Math.abs(c - x) < Math.abs(xs[b]! - x) ? i : b), 0);
        const ok = await page.locator(`.rb-slider[aria-valuenow="${want + 1}"]`).waitFor({ timeout: 1_000 }).then(() => true, () => false);
        const v = Number(await slider(page).getAttribute('aria-valuenow')) - 1;
        if (!ok) throw new Error(`at x ${Math.round(x)} the drag selects change ${v + 1}, the bar under the pointer is ${want + 1}`);
        if (seen.at(-1) !== v) seen.push(v);
      }
      await page.mouse.up();
      if (seen.some((v, i) => i > 0 && v < seen[i - 1]!) || seen.length !== entries.length) throw new Error(`drag order ${seen.map((v) => v + 1).join(',')}`);
      await expectSelected(page, defaultFixture, entries.length - 1);
      const c = await barAt(page, 2);
      await page.mouse.move(c.x, c.y);
      const tip = page.locator('.rb-tip');
      await tip.waitFor({ timeout: 2_000 });
      if (!((await tip.textContent()) ?? '').includes(entries[2]!.ruleSummary)) throw new Error('hover tooltip shows the wrong change');
      // WCAG 1.4.13: the tip is hoverable (moving onto it keeps it) and Escape dismisses it.
      const t = (await tip.boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 6 });
      await page.waitForTimeout(400); // longer than the hover grace period
      if (!(await tip.isVisible())) throw new Error('tooltip vanished when the pointer moved onto it');
      await page.keyboard.press('Escape');
      await tip.waitFor({ state: 'detached', timeout: 2_000 });
      await page.mouse.move(c.x + 1, c.y);
      await tip.waitFor({ timeout: 2_000 });
      // A thumbnail click shows that capture, its change selected (phones show no thumbnails).
      const ts = defaultFixture.snapshots[3]!.ts;
      const thumbs = viewport !== 'mobile';
      if (thumbs) {
        await page.locator(`.rb-th[data-ts="${ts}"]`).click();
        await expectShown(page, defaultFixture, ts);
      }
      return { notes: [`click -> 2, drag ${seen.map((v) => v + 1).join(',')} on x, hover tooltip on 3, hoverable, Escape hides it${thumbs ? ', thumbnail #04 shown' : ''}`] };
    },
  },
  {
    name: 'timeline-deeplink',
    description: '?sample=git-scm&change=<from>-<to> selects that change; an unknown change falls back to the latest; reflows at 320 px',
    async run({ page, baseUrl }) {
      const f = fixtures.find((x) => x.id === 'git-scm')!;
      const t = timelineOf(f);
      const e = t.entries[2]!;
      const timeToReadyMs = await openReady(page, baseUrl, `/?sample=git-scm&change=${e.from}-${e.to}`);
      if ((await page.locator('#sample-label').textContent())?.trim() !== f.label) throw new Error('deep link did not open git-scm');
      const said = await expectSelected(page, f, 2);
      const ticks = await page.locator('.rb-dot').count();
      if (ticks !== t.trivialCaptures.length) throw new Error(`${ticks} hollow dots for ${t.trivialCaptures.length} trivial captures`);
      await openReady(page, baseUrl, '/?sample=git-scm&change=bogus');
      await expectSelected(page, f, t.entries.length - 1);
      // Invalid query values are replaced in the address bar by the state actually shown.
      const latest = (x: Fixture) => { const l = timelineOf(x).entries.at(-1)!; return `${l.from}-${l.to}`; };
      if (new URL(page.url()).search !== `?sample=git-scm&change=${latest(f)}`) throw new Error(`bogus change not replaced: ${page.url()}`);
      await openReady(page, baseUrl, '/?sample=nope');
      if (new URL(page.url()).search !== `?sample=${defaultFixture.id}`) throw new Error(`bogus sample not replaced: ${page.url()}`);
      await page.setViewportSize({ width: 320, height: 800 });
      await noPageOverflow(page);
      // Let any picture fade finish so axe measures settled colours.
      await settle(page);
      return { timeToReadyMs, notes: [said, `${ticks} hollow dots; bogus change -> latest; no page overflow at 320 px`] };
    },
  },
  {
    name: 'diff-default',
    description: 'The latest change\'s diff: capture links, hidden prefixes in order, symbols and line styles, < 1,500 nodes for the largest change; Every change lists every change, newest first',
    shot: 'diff',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl, viewport }) {
      // Largest change of any sample, by block ops: its panel stays small with unchanged runs collapsed.
      const [lf, li] = fixtures.flatMap((f) => timelineOf(f).entries.map((e, i) => [f, i, e.diff.ops.length] as const)).sort((x, y) => y[2] - x[2])[0]!;
      const le = timelineOf(lf).entries[li]!;
      await openReady(page, baseUrl, `/?sample=${lf.id}&change=${le.from}-${le.to}`);
      const nodes = await page.evaluate(() => document.querySelectorAll('#diff *').length);
      if (nodes >= 1500) throw new Error(`diff panel has ${nodes} nodes`);
      // The bare first view diffs the decade compare; the latest change is one deep link (or one Previous) away.
      const last = defaultTimeline.entries.at(-1)!;
      const timeToReadyMs = await openReady(page, baseUrl, `/?change=${last.from}-${last.to}`);
      const notes = await checkDiff(page, defaultFixture, defaultTimeline.entries.length - 1);
      // Every change: open at every width (redesign phase 5), one row per change, newest first.
      const heading = (await page.locator('#changes-heading').textContent())?.trim();
      const rows = await page.locator('.changes .change-sum').allTextContents();
      const want = defaultTimeline.entries.map(shownSummary).reverse();
      if (heading !== 'Every change' || rows.join('|') !== want.join('|')) throw new Error(`${viewport}: "${heading}" lists ${rows.join(' | ')}`);
      await noPageOverflow(page);
      return { timeToReadyMs, notes: [...notes, `largest change ${lf.id} #${li + 1} (${le.diff.ops.length} ops): ${nodes} nodes`] };
    },
  },
  {
    name: 'diff-keyboard',
    description: 'Skip to diff, Tab to an unchanged run and expand it (focus follows), Previous and Next from the keyboard',
    shot: 'diff',
    suffix: '-kbd',
    async run({ page, baseUrl }) {
      // Wikipedia: its latest diff has collapsed unchanged runs to expand (the default's redesign has none).
      const f = fixtures.find((x) => x.id === 'wikipedia-internet-archive')!;
      const n = timelineOf(f).entries.length;
      const last = timelineOf(f).entries.at(-1)!;
      await openReady(page, baseUrl, `/?sample=${f.id}&change=${last.from}-${last.to}`);
      const active = () => page.evaluate(() => `${document.activeElement?.className}|${document.activeElement?.textContent?.trim().slice(0, 40)}`);
      const tabTo = async (cls: string) => {
        for (let k = 0; k < 40; k++) {
          await page.keyboard.press('Tab');
          if ((await active()).split('|')[0]!.split(' ').includes(cls)) return;
        }
        throw new Error(`no tab stop .${cls}`);
      };
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      if (!(await active()).endsWith('Skip to diff')) throw new Error(`second tab stop is ${await active()}`);
      await page.keyboard.press('Enter');
      if ((await page.evaluate(() => document.activeElement?.id)) !== 'diff') throw new Error('skip link did not move focus to the diff');
      const gaps = await page.locator('.db-gap').count();
      await tabTo('db-gap');
      await page.keyboard.press('Enter');
      if ((await page.locator('.db-gap').count()) !== gaps - 1 || !(await active()).startsWith('db-open')) throw new Error(`expanding: ${await active()}`);
      // Previous / Next sit under the picture, before the diff in the tab order.
      await page.locator('.diff-nav .btn').first().focus();
      await page.keyboard.press('Enter');
      await expectSelected(page, f, n - 2);
      await checkDiff(page, f, n - 2);
      // checkDiff opened "Show more changes", which takes focus: back to Previous, then Tab to Next.
      await page.locator('.diff-nav .btn').first().focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await expectSelected(page, f, n - 1);
      if ((await page.locator('.diff-nav .btn').last().getAttribute('aria-disabled')) !== 'true') throw new Error('Next not disabled at the last change');
      return { notes: [`skip link -> #diff; expanded 1 of ${gaps} runs; Previous -> ${n - 1}, Next x2 -> ${n} (stays)`] };
    },
  },
  {
    name: 'diff-expanded',
    description: 'A change with structure edits: the facts name its sections; Show more changes, every unchanged run and long block show the whole later page',
    async run({ page, baseUrl }) {
      const e = defaultTimeline.entries.at(-2)!;
      await openReady(page, baseUrl, `/?change=${e.from}-${e.to}`);
      const facts = await page.locator('.cs-facts > div').evaluateAll((ds) => ds.map((d) => `${d.querySelector('dt')?.textContent}: ${d.querySelector('dd')?.textContent}`));
      const { added, removed, renamed } = namedSections(e.record);
      const want = [added.length && `New sections: ${added.join(', ')}`, removed.length && `Gone: ${removed.join(', ')}`, renamed.length && 'Renamed'].filter(Boolean) as string[];
      if (!facts[0]?.startsWith('Words: ') || want.some((w) => !facts.some((x) => x.startsWith(w)))) throw new Error(`facts: ${facts.join(' | ')}`);
      if (await page.locator('.db-more .btn').count()) await page.locator('.db-more .btn').click();
      while (await page.locator('.db-gap').count()) await page.locator('.db-gap').first().click();
      for (const b of await page.locator('.db .btn-link').all()) await b.click();
      const blocks = await page.locator('.diff-body .db').count();
      if (blocks !== e.diff.ops.length || (await page.locator('.is-clamped').count())) throw new Error(`${blocks} blocks for ${e.diff.ops.length} ops`);
      return { notes: [`facts: ${facts.join(' | ')}`, `${blocks} blocks shown, none clamped`] };
    },
  },
  {
    name: 'diff-copy-link',
    description: 'Copy link puts the deep link on the clipboard, confirms politely, and the link restores the view; trivial edits can be shown and selected',
    async run({ page, baseUrl }) {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin });
      const f = fixtures.find((x) => x.id === 'git-scm')!;
      const t = timelineOf(f);
      await openReady(page, baseUrl, `/?sample=git-scm`);
      // From the decade compare, Previous first narrows to the latest change, then steps back.
      await page.locator('.diff-nav .btn').first().click();
      await expectSelected(page, f, t.entries.length - 1);
      await page.locator('.diff-nav .btn').first().click();
      await expectSelected(page, f, t.entries.length - 2);
      await page.locator('.controls .vp-copy').click();
      // Seen on the button, and said by the polite status region (its text is for screen readers on success).
      await page.locator('.controls .vp-copy[data-said="ok"]', { hasText: 'Link copied' }).waitFor({ timeout: 2_000 });
      await page.waitForFunction(() => document.querySelector('.controls [role="status"]')?.textContent === 'Link copied', null, { timeout: 2_000 });
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      if (copied !== page.url() || !copied.includes('change=')) throw new Error(`copied "${copied}", page at ${page.url()}`);
      await openReady(page, baseUrl, new URL(copied).pathname + new URL(copied).search);
      await expectSelected(page, f, t.entries.length - 2);
      // "Show them" turns the hollow dots into selectable, labelled entries.
      const trivial = trivialEntries(t);
      await page.locator('.changes-trivial button', { hasText: 'Show them' }).click();
      await page.locator('.changes-trivial button', { hasText: 'Hide them' }).waitFor({ timeout: 2_000 });
      const marks = await page.locator('.rb-slider .rb-dot[data-index]').count();
      const items = await page.locator('.changes li').count();
      if (marks !== trivial.length || items !== t.entries.length + trivial.length) throw new Error(`${marks} trivial dots on the slider, ${items} list items`);
      await page.locator('.change', { hasText: 'trivial' }).last().click();
      await page.locator('.change[aria-current="true"]', { hasText: 'trivial' }).waitFor({ timeout: 2_000 });
      if (!page.url().includes(`change=${trivial[0]!.from}-${trivial[0]!.to}`)) throw new Error(`trivial entry not selected: ${page.url()}`);
      return { notes: [`copied ${new URL(copied).search}, reopened it; ${marks} trivial entries shown and selectable`] };
    },
  },
  {
    name: 'header',
    description: 'Pagelapse title, meta and wordmark (accessible name "Pagelapse", favicon link)',
    schemes: ['light', 'dark'],
    cvd: true,
    clip: '.site-header',
    async run({ page, baseUrl }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      const want = 'Pagelapse: see how any web page changed over the years';
      const title = await page.title();
      if (title !== want) throw new Error(`document.title "${title}", expected "${want}"`);
      const meta = await page.evaluate(() =>
        ['meta[name="application-name"]', 'meta[property="og:site_name"]', 'meta[property="og:title"]', 'link[rel="icon"]'].map(
          (sel) => document.querySelector(sel)?.getAttribute(sel.startsWith('link') ? 'href' : 'content') ?? '',
        ),
      );
      if (meta.join('|') !== `Pagelapse|Pagelapse|${want}|/favicon.svg`) throw new Error(`meta: ${meta.join(' | ')}`);
      const home = page.getByRole('heading', { level: 1 }).getByRole('link', { name: 'Pagelapse', exact: true });
      if ((await home.count()) !== 1) throw new Error('no h1 home link named exactly "Pagelapse"');
      await page.evaluate(() => document.fonts.ready);
      return { timeToReadyMs, notes: [`title "${title}"`, 'h1 link name "Pagelapse"', `meta: ${meta.join(' | ')}`] };
    },
  },
  {
    name: 'brand',
    description: 'favicon.svg at 16, 32 and 64 px on the light and the dark ground',
    shot: 'brand-favicon',
    viewports: ['desktop'],
    clip: '#brand-sheet',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const sizes = [16, 32, 64];
      const [paper, ink] = [palette.light.bg, palette.dark.bg];
      const loaded = await page.evaluate(
        async ({ sizes, paper, ink }) => {
          const sheet = document.createElement('div');
          sheet.id = 'brand-sheet';
          sheet.setAttribute('style', 'display:inline-flex;flex-direction:column;align-self:flex-start;margin:16px');
          for (const bg of [paper, ink]) {
            const row = document.createElement('div');
            row.setAttribute('style', `display:flex;gap:24px;align-items:center;padding:24px;background:${bg}`);
            for (const s of sizes) row.insertAdjacentHTML('beforeend', `<img src="/favicon.svg" width="${s}" height="${s}" alt="Pagelapse icon, ${s} px">`);
            sheet.append(row);
          }
          document.getElementById('root')!.style.display = 'none';
          document.body.append(sheet);
          const imgs = [...sheet.querySelectorAll('img')];
          await Promise.all(imgs.map((i) => i.decode()));
          return imgs.filter((i) => i.naturalWidth > 0).length;
        },
        { sizes, paper, ink },
      );
      if (loaded !== sizes.length * 2) throw new Error(`${loaded} of ${sizes.length * 2} favicons rendered`);
      return { notes: [`favicon.svg rendered at ${sizes.join(', ')} px on the light and the dark ground`] };
    },
  },
  {
    name: 'visual-default',
    description: 'The first view: the decade compare (first ↔ latest capture) in Slider, named "First and latest", the title block and stage above the fold; ready <= 1,000 ms, visual-ready <= 1,500 ms, CLS < 0.02, first-view pictures <= 160 KB',
    shot: 'hero',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl, viewport }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      await page.waitForSelector('[data-visual-ready="true"]', { timeout: 5_000 });
      const { from, to } = hero;
      const said = await expectSlider(page, 50);
      // Honest about the pair: the step label and the change line say first and latest capture, not one change.
      const named = await page.evaluate(() => [document.querySelector('.step-label [aria-hidden]')?.textContent ?? '', document.querySelector('#change-heading')?.textContent ?? ''] as const);
      if (named[0] !== 'First and latest' || !/^first → capture to latest,/.test(named[1].trim())) throw new Error(`pair not named: step "${named[0]}", heading "${named[1]}"`);
      if (viewport !== 'mobile' && (await page.locator('.rb-th').count()) !== defaultFixture.snapshots.length) throw new Error('not one thumbnail per capture');
      if (new URL(page.url()).search !== `?sample=${DEFAULT_ID}`) throw new Error(`first view rewrote the URL: ${page.url()}`);
      await page.waitForTimeout(500);
      const m = await page.evaluate(async () => {
        // No layout shift at all means no entry and no callback: 0 after a short wait.
        const cls = await new Promise<number>((done) => {
          setTimeout(() => done(0), 500);
          new PerformanceObserver((l) => done(l.getEntries().reduce((n, e) => n + ((e as unknown as { hadRecentInput: boolean }).hadRecentInput ? 0 : (e as unknown as { value: number }).value), 0))).observe({ type: 'layout-shift', buffered: true });
        }).then((v) => v, () => 0);
        const pics = performance.getEntriesByType('resource').filter((r) => r.name.includes('/samples/')) as PerformanceResourceTiming[];
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        return {
          visual: Math.round(performance.getEntriesByName('wd:visual-ready')[0]!.startTime),
          cls,
          bytes: pics.reduce((n, r) => n + r.encodedBodySize, 0),
          count: pics.length,
          // The stage is 1200 x 750 at full width (target/V3Work.html): its top and the title block are on first view.
          fold: [box('.sheet-head').bottom, box('.vp-mat').top + box('.vp-mat').height / 2],
          paneWidth: box('.vp-mat').width,
        };
      });
      const problems = [
        timeToReadyMs > 1000 && `ready ${timeToReadyMs} ms > 1,000`,
        m.visual > 1500 && `visual-ready ${m.visual} ms > 1,500`,
        m.cls >= 0.02 && `CLS ${m.cls.toFixed(3)}`,
        m.bytes > 160_000 && `first-view pictures ${m.bytes} B > 160 KB`,
        viewport === 'desktop' && m.fold.some((y) => y > 800) && `title or the stage's upper half below the fold: ${m.fold.map(Math.round).join(', ')}`,
        viewport === 'mobile' && m.paneWidth < 300 && `pane only ${m.paneWidth}px wide on mobile`,
      ].filter(Boolean);
      if (problems.length) throw new Error(problems.join('; '));
      await noPageOverflow(page);
      return { timeToReadyMs, notes: [`decade ${from}-${to} in Slider mode: ${said}`, `heading "${named[1].trim()}"`, `visual-ready ${m.visual} ms, CLS ${m.cls.toFixed(4)}`, `first-view pictures: ${m.count} files, ${m.bytes} B`, `fold (title block, stage middle): ${m.fold.map(Math.round).join(', ')}`] };
    },
  },
  {
    name: 'changes-list-follows',
    description: 'Desktop: Every change, after the ribbon and the change, marks the selected change after load, Previous, a thumbnail and the slider; it has no scroll box of its own and the page never scrolls',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const { entries } = defaultTimeline;
      const notes = [`load: ${await currentInList(page)}`];
      // Dispatched clicks: a real click would let Playwright scroll the page to the target first.
      // From the decade compare, Previous first narrows to the selected latest change, then steps back.
      await page.locator('.diff-nav .btn').first().dispatchEvent('click');
      await expectSelected(page, defaultFixture, entries.length - 1);
      await page.locator('#change-heading', { hasText: shownSummary(entries.at(-1)!) }).waitFor({ timeout: 2_000 });
      await page.locator('.diff-nav .btn').first().dispatchEvent('click');
      await expectSelected(page, defaultFixture, entries.length - 2);
      notes.push(`Previous: ${await currentInList(page)}`);
      await page.locator('.rb-th').first().dispatchEvent('click');
      await expectSelected(page, defaultFixture, 0);
      notes.push(`thumbnail #01: ${await currentInList(page)}`);
      // Focusing the timeline scrolls the page to it; the End key itself must not scroll the page further.
      await slider(page).focus();
      // Wait out the page's smooth scroll to the timeline.
      let y = -1;
      for (let k = 0; k < 30 && y !== (y = await page.evaluate(() => scrollY)); k++) await page.waitForTimeout(100);
      await page.keyboard.press('End');
      await expectSelected(page, defaultFixture, entries.length - 1);
      notes.push(`timeline End: ${await currentInList(page, y)}`);
      return { notes };
    },
  },
  {
    name: 'visual-mobile-link',
    description: 'Phones: the picture\'s "Open capture" link and its focus ring clear the sticky Previous / Next bar on first view and when focused, at 390 and 320 px',
    viewports: ['mobile'],
    async run({ page, baseUrl }) {
      const notes: string[] = [];
      for (const [width, height] of [[390, 844], [320, 844], [320, 568]] as const) {
        await page.setViewportSize({ width, height });
        // Single: the caption's own "Open capture" (in compare modes the captures' links are in the change section).
        await openReady(page, baseUrl, '/?view=single');
        await settle(page);
        // Short screens cannot show the caption on first view; there the link must come clear when tabbed to.
        if (height < 700) {
          for (let k = 0; k < 40 && !(await page.evaluate(() => document.activeElement?.matches('.vpane .cap-out'))); k++) await page.keyboard.press('Tab');
          if (!(await page.evaluate(() => document.activeElement?.matches('.vpane .cap-out')))) throw new Error('could not tab to "Open capture"');
          await page.waitForTimeout(400);
        }
        const hit = await page.evaluate(() => {
          const a = document.querySelector('.vpane .cap-out')!.getBoundingClientRect();
          const nav = document.querySelector('.diff-nav')!.getBoundingClientRect();
          const el = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
          return { ok: !!el?.closest('.vpane .cap-out'), got: el ? `${el.tagName.toLowerCase()}.${el.className}` : 'nothing', bottom: a.bottom, navTop: nav.top };
        });
        const label = `${width}x${height}${height < 700 ? ' focused' : ' first view'}`;
        // 4 px: the 2 px outline at a 2 px offset.
        if (!hit.ok || hit.bottom + 4 > hit.navTop) throw new Error(`${label}: hit-test at "Open capture" gives ${hit.got}; link ends ${Math.round(hit.bottom)}, bar starts ${Math.round(hit.navTop)}`);
        notes.push(`${label}: link ends ${Math.round(hit.bottom)}, bar starts ${Math.round(hit.navTop)}`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await openReady(page, baseUrl);
      return { notes };
    },
  },
  {
    name: 'visual-thumbnails-keyboard',
    description: 'Tab to the ribbon\'s thumbnails (one stop), Home, Right x3, Enter: the pane, the slider valuetext and the list follow',
    shot: 'ribbon',
    suffix: '-kbd',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl, '/?view=single');
      const stops = new Set<string>();
      for (let k = 0; k < 60 && !(await page.evaluate(() => document.activeElement?.classList.contains('rb-th'))); k++) {
        await page.keyboard.press('Tab');
        stops.add(await page.evaluate(() => document.activeElement?.className ?? ''));
      }
      for (const key of ['Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter']) await page.keyboard.press(key);
      const ts = defaultFixture.snapshots[3]!.ts;
      await page.locator(`.rb-th[aria-current="true"][data-ts="${ts}"]`).waitFor({ timeout: 2_000 });
      await expectShown(page, defaultFixture, ts);
      const said = await expectSelected(page, defaultFixture, changeForCapture(defaultTimeline.entries, ts));
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.classList.contains('rb-th'))) throw new Error('the thumbnails have more than one tab stop');
      await page.keyboard.press('Shift+Tab');
      return { notes: [`thumbnail #04 shown (${ts}); ${said}`, `tab stops before the thumbnails: ${[...stops].join(' | ')}`] };
    },
  },
  {
    name: 'visual-timeline-sync',
    description: 'Slider keys swap the picture and the ringed thumbnail; Before / After flips sides and is kept while scrubbing (?at=)',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl, '/?view=single');
      const { entries } = defaultTimeline;
      await slider(page).focus();
      for (const [key, i] of [['Home', 0], ['ArrowRight', 1]] as const) {
        await page.keyboard.press(key);
        await expectSelected(page, defaultFixture, i);
        await expectShown(page, defaultFixture, entries[i]!.to);
      }
      await page.locator('.vp-side', { hasText: 'Before' }).click();
      if ((await page.locator('.vp-side[role="radio"][aria-checked="true"]').textContent())?.includes('Before') !== true) throw new Error('Before is not the checked radio');
      await expectShown(page, defaultFixture, entries[1]!.from);
      if (new URL(page.url()).searchParams.get('at') !== entries[1]!.from) throw new Error(`no ?at= for Before: ${page.url()}`);
      await slider(page).focus();
      await page.keyboard.press('ArrowRight');
      await expectShown(page, defaultFixture, entries[2]!.from);
      await openReady(page, baseUrl, page.url().replace(baseUrl, '/'));
      await expectShown(page, defaultFixture, entries[2]!.from);
      await settle(page);
      return { notes: ['Home, Right swap pictures; Before kept on Right; ?at= restores it'] };
    },
  },
  {
    name: 'visual-tab-order',
    description: 'Desktop: the workspace tabs in visual order: the stage, its controls row, the ribbon thumbnails and slider, the change and its diff, Every change',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const parts = ['vpane', 'controls', 'rb-strip', 'rb-slider', 'change-section', 'every'];
      const seen: string[] = [];
      for (let k = 0; k < 120; k++) {
        await page.keyboard.press('Tab');
        const part = await page.evaluate((ps) => {
          const el = document.activeElement;
          if (!el || el === document.body || el.closest('footer')) return null;
          return ps.find((p) => el.closest(`.stage .${p}`)) ?? '';
        }, parts);
        if (part === null) break;
        if (part && seen.at(-1) !== part) seen.push(part);
      }
      if (seen.length < parts.length || seen.join() !== parts.slice(0, seen.length).join()) throw new Error(`stage tab order: ${seen.join(' -> ')}`);
      // The stage's last stop (the divider in Slider) leads to Play, the first control under it.
      await page.locator('.vpane .vp-split').focus();
      await page.keyboard.press('Tab');
      const next = await page.evaluate(() => `${document.activeElement?.closest('.controls') ? 'controls' : 'elsewhere'}: ${document.activeElement?.textContent?.trim().slice(0, 30)}`);
      if (next !== 'controls: Play time-lapse') throw new Error(`after the divider: ${next}`);
      // The visual order matches: each part starts below the one before it.
      const tops = await page.evaluate((ps) => ps.map((p) => Math.round(document.querySelector(`.stage .${p}`)!.getBoundingClientRect().top)), parts);
      if (tops.some((t, i) => i > 0 && t <= tops[i - 1]!)) throw new Error(`parts out of visual order: ${parts.map((p, i) => `${p} ${tops[i]}`).join(', ')}`);
      return { notes: [`stage: ${seen.join(' -> ')}`, `after the divider: ${next}`, `tops: ${parts.map((p, i) => `${p} ${tops[i]}`).join(', ')}`] };
    },
  },
  {
    name: 'visual-zoom-spacing',
    description: '1024 px at 125% text with WCAG 1.4.12 spacing: the controls row wraps instead of clipping, stays between the stage and the ribbon, and the page never scrolls sideways',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await page.setViewportSize({ width: 1024, height: 768 });
      await openReady(page, baseUrl);
      // A constructed stylesheet: the CSP (style-src 'self') blocks injected <style> elements.
      await page.evaluate((css) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      }, 'html { font-size: 125% !important; } * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }');
      await settle(page);
      const m = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const row = r('.controls');
        const kids = [...document.querySelectorAll('.controls button, .controls .vp-modes')].map((k) => k.getBoundingClientRect());
        return { stage: r('.vpane').bottom, top: row.top, bottom: row.bottom, film: r('.rb').top, out: kids.filter((k) => k.left < row.left - 8.5 || k.right > row.right + 8.5).length };
      });
      const problems = [
        m.top < m.stage - 0.5 && `controls start at ${Math.round(m.top)}, inside the stage (ends ${Math.round(m.stage)})`,
        m.bottom > m.film + 0.5 && `controls end at ${Math.round(m.bottom)}, ribbon starts at ${Math.round(m.film)}`,
        m.out > 0 && `${m.out} controls outside the row`,
      ].filter(Boolean);
      if (problems.length) throw new Error(problems.join('; '));
      await noPageOverflow(page);
      return { notes: [`stage ends ${Math.round(m.stage)}, controls ${Math.round(m.top)}-${Math.round(m.bottom)}, ribbon ${Math.round(m.film)}`] };
    },
  },
  {
    name: 'stage-fit',
    description: 'Desktop 1024×768, 1280×800 and 1440×900, every sample: the stage fills the column at 16:10 (1200 × 750 at 1440), the controls row sits 16 px under it, and nothing scrolls sideways',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const notes: string[] = [];
      for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900]] as const) {
        await page.setViewportSize({ width, height });
        for (const f of fixtures) {
          await openReady(page, baseUrl, `/?sample=${f.id}`);
          await settle(page);
          const m = await page.evaluate(() => {
            const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
            return { mat: r('.vpane .vp-mat'), main: r('main'), controls: r('.controls'), scrollY };
          });
          const label = `${width}x${height} ${f.id}`;
          const problems = [
            Math.abs(m.mat.width - m.main.width) > 1 && `stage ${Math.round(m.mat.width)} wide in a ${Math.round(m.main.width)} column`,
            Math.abs(m.mat.width / m.mat.height - 1.6) > 0.01 && `stage ${Math.round(m.mat.width)} x ${Math.round(m.mat.height)} is not 16:10`,
            width === 1440 && Math.round(m.mat.width) !== 1200 && `stage ${Math.round(m.mat.width)} wide at 1440, expected 1200`,
            Math.round(m.controls.top - m.mat.bottom) !== 16 && `controls ${Math.round(m.controls.top - m.mat.bottom)} px under the stage`,
            m.scrollY !== 0 && `the page scrolled to ${m.scrollY}`,
          ].filter(Boolean);
          if (problems.length) throw new Error(`${label}: ${problems.join('; ')}`);
          notes.push(`${label}: stage ${Math.round(m.mat.width)} x ${Math.round(m.mat.height)}`);
          await noPageOverflow(page);
        }
      }
      await page.setViewportSize({ width: 1280, height: 800 });
      await openReady(page, baseUrl);
      return { notes };
    },
  },
  {
    name: 'visual-partial',
    description: 'A capture recorded without a stylesheet carries the "missing some styles or images" badge',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const f = defaultFixture;
      const ts = f.snapshots.find((s) => s.shot?.status === 'partial')!.ts;
      await openReady(page, baseUrl, `/?at=${ts}&view=single`);
      await expectShown(page, f, ts);
      await page.locator('.vpane .vp-mat .vp-badge', { hasText: "The archive's copy is missing some styles or images" }).waitFor({ timeout: 2_000 });
      const labelled = await page.locator('.rb-th[data-partial][aria-label$="partial copy"]').count();
      if (labelled !== f.snapshots.filter((s) => s.shot?.status === 'partial').length) throw new Error(`${labelled} thumbnails named "partial copy"`);
      await page.waitForSelector('[data-visual-ready="true"]');
      return { notes: [`${ts}: partial tag on the picture, ${labelled} thumbnails named "partial copy"`] };
    },
  },
  {
    name: 'visual-failed',
    description: 'A capture with no picture: in Slider the stage keeps its place with the reason as a tag on the picture and no caption; in Single the hatched card, its reason and "Open capture"; its thumbnail says "no picture"',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const f = fixtures.find((x) => x.id === 'rust-lang')!;
      const shot = f.snapshots.find((s) => s.shot?.status === 'failed')!;
      const card = page.locator('.vp-none', { hasText: 'No picture of this capture' });
      const place = () => page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        return [r('.vpane .vp-mat').top, r('.vpane .vp-mat').height, r('.controls').top].map(Math.round).join(',');
      });
      // Slider on a pair with pictures, then on the pair lacking one: the fallback keeps the stage and the controls where they were.
      await openReady(page, baseUrl, `/?sample=${f.id}`);
      const before = await place();
      await openReady(page, baseUrl, `/?sample=${f.id}&at=${shot.ts}`);
      const tag = await page.locator('.vpane .vp-mat', { hasText: /◑ No picture of the (Before|After) capture/ }).count();
      const after = await place();
      const caption = await page.locator('.vpane .vp-cap').count();
      if (tag !== 1 || after !== before || caption) throw new Error(`Slider fallback: tag ${tag}, stage and controls ${before} -> ${after}, ${caption} captions`);
      await openReady(page, baseUrl, `/?sample=${f.id}&at=${shot.ts}&view=single`);
      await card.waitFor({ timeout: 2_000 });
      const href = await page.locator('.vp-cap a').getAttribute('href');
      if (href !== viewCaptureUrl(f.source.archive, shot.ts, f.url)) throw new Error(`open capture link ${href}`);
      if ((await page.locator('.rb-none', { hasText: 'no picture' }).count()) !== f.snapshots.filter((s) => !s.shot?.file).length) throw new Error('"no picture" thumbnails');
      return { notes: [`Slider fallback: tag on the picture, stage and controls at ${before}`, `${shot.ts}: hatched card (${shot.shot!.reason}), link ${href}`] };
    },
  },
  {
    name: 'compare-slider',
    description: 'The hero opens in Slider mode on the decade compare: Before / After labelled by symbol, word, date and corner, divider at 50%',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      await page.waitForSelector('[data-visual-ready="true"]', { timeout: 5_000 });
      await noPageOverflow(page);
      return { timeToReadyMs, notes: [await expectSlider(page, 50)] };
    },
  },
  {
    name: 'compare-slider-keyboard',
    description: 'Divider keys: Left x4, End, Home, PageUp, Enter (reset), Left x4; aria-valuenow, valuetext and the computed clip follow',
    shot: 'compare-slider',
    suffix: '-kbd',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      await page.locator('.vp-split').focus();
      const notes: string[] = [];
      for (const [keys, v] of [[['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft'], 30], [['End'], 100], [['Home'], 0], [['PageUp'], 25], [['Enter'], 50], [['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft'], 30]] as const) {
        for (const k of keys) await page.keyboard.press(k);
        notes.push(`${keys.join('+')}: ${await expectSlider(page, v)}`);
      }
      return { notes };
    },
  },
  {
    name: 'compare-slider-drag',
    description: 'Dragging the divider (32 px hit area, pointer capture) follows the pointer, also past the picture edge; double-click resets',
    viewports: ['desktop', 'mobile'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const box = (await page.locator('.vp-cmp').boundingBox())!;
      const hit = (await page.locator('.vp-split').boundingBox())!;
      if (hit.width < 32 || hit.height < 32) throw new Error(`hit area ${hit.width}x${hit.height}`);
      await page.mouse.move(hit.x + hit.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2, { steps: 5 });
      const quarter = await expectSlider(page, 25);
      await page.mouse.move(box.x - 40, box.y + 10, { steps: 3 });
      await page.mouse.up();
      const edge = await expectSlider(page, 0);
      await page.locator('.vp-split').dblclick();
      const reset = await expectSlider(page, 50);
      // WCAG 2.5.7: a single click anywhere on the pictures moves the divider there, no drag needed.
      await page.locator('.vp-cmp').scrollIntoViewIfNeeded();
      const now = (await page.locator('.vp-cmp').boundingBox())!;
      await page.mouse.click(now.x + now.width * 0.85, now.y + now.height / 2);
      const clicked = await expectSlider(page, 85);
      // WCAG 1.4.10: at 320 px the Before and After chips do not overlap.
      const size = page.viewportSize()!;
      await page.setViewportSize({ width: 320, height: 640 });
      const chips = await page.locator('.vp-label').evaluateAll((ls) => ls.map((l) => JSON.parse(JSON.stringify(l.getBoundingClientRect()))));
      const [b, a] = chips;
      if (chips.length !== 2 || !(b.right <= a.left || b.bottom <= a.top || a.bottom <= b.top)) throw new Error(`chips overlap at 320 px: ${JSON.stringify(chips)}`);
      await page.setViewportSize(size);
      return { notes: [`drag to 1/4: ${quarter}`, `past the edge: ${edge}`, `double-click: ${reset}`, `click at 85%: ${clicked}`, `chips apart at 320 px (${Math.round(b.right)} <= ${Math.round(a.left)})`] };
    },
  },
  {
    name: 'compare-side',
    description: 'Side by side: two stages, each under its own tag (dot, word, date) and link, side by side on desktop and stacked on phones; ?view=side',
    async run({ page, baseUrl, viewport }) {
      await openReady(page, baseUrl, '/?view=side');
      const figs = await page.locator('.vp-pair .vp-fig').evaluateAll((fs) =>
        fs.map((f) => ({ ...JSON.parse(JSON.stringify(f.querySelector('.vp-mat')!.getBoundingClientRect())), label: f.querySelector('.vp-tag')?.textContent, links: f.querySelectorAll('.cap-out').length })),
      );
      const [a, b] = figs;
      const problems = [
        figs.length !== 2 && `${figs.length} stages`,
        a?.label !== `Before ${formatTimestampShort(hero.from)}` || b?.label !== `After ${formatTimestampShort(hero.to)}` ? `tags ${a?.label} / ${b?.label}` : '',
        figs.some((m) => m.links !== 1) && 'not one capture link per stage',
        viewport === 'desktop' && a && b && (a.top !== b.top || a.right > b.left) && 'stages are not side by side',
        viewport === 'mobile' && a && b && a.bottom > b.top && 'stages are not stacked',
        (await checkedMode(page)) !== 'side' && `mode ${await checkedMode(page)}`,
      ].filter(Boolean);
      // The two links' accessible names, as a screen reader gets them: word, "capture" and the date.
      const tree = await page.locator('.vp-pair').ariaSnapshot();
      for (const [word, ts] of [['Before', hero.from], ['After', hero.to]] as const) {
        const name = `Open ${word} capture, ${formatTimestampLong(ts)} (opens in a new tab)`;
        if (!tree.includes(`link "${name}"`)) problems.push(`no link "${name}" in ${tree.replace(/\n/g, ' ')}`);
      }
      const shown = await page.locator('.vp-pair .cap-out').evaluateAll((as) => as.map((x) => `${x.textContent}${getComputedStyle(x, '::after').content.includes('↗') ? ' ↗' : ''}`));
      if (shown.join() !== 'Open Before capture ↗,Open After capture ↗') problems.push(`visible link text ${shown.join(' | ')}`);
      if (problems.length) throw new Error(problems.join('; '));
      await noPageOverflow(page);
      return { notes: [`${a.label} | ${b.label}`, `links: ${tree.split('\n').filter((l) => l.includes('link')).map((l) => l.trim()).join(' | ')}`] };
    },
  },
  {
    name: 'compare-segmented',
    description: 'The compare control is one segmented radio group (one tab stop): Right from Slider checks Side by side, then Single, and the URL follows; phones offer Slider and Single',
    async run({ page, baseUrl, viewport }) {
      await openReady(page, baseUrl);
      const labels = await page.locator('#vp-modes .vp-mode').evaluateAll((ls) => ls.filter((l) => getComputedStyle(l).display !== 'none').map((l) => l.textContent?.trim()));
      const want = viewport === 'mobile' ? 'Slider,Single' : 'Slider,Side by side,Single';
      if (labels.join() !== want) throw new Error(`modes shown: ${labels.join()}`);
      await page.getByRole('radio', { name: 'Slider' }).focus();
      const steps: string[] = [];
      for (const _ of viewport === 'mobile' ? [1] : [1, 2]) {
        await page.keyboard.press('ArrowRight');
        steps.push(`${await checkedMode(page)} (view=${new URL(page.url()).searchParams.get('view')})`);
      }
      if ((await checkedMode(page)) !== 'single' || new URL(page.url()).searchParams.get('view') !== 'single') throw new Error(`after Right: ${steps.join(' -> ')}`);
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.matches('input[name="vp-mode"]'))) throw new Error('the compare control has more than one tab stop');
      return { notes: [`shown: ${labels.join(', ')}`, `Right: ${steps.join(' -> ')}`] };
    },
  },
  {
    name: 'compare-deeplink',
    description: '?view=side opens Side by side and the mode persists across selection changes; a retired ?view=onion and an unknown view fall back to Slider and leave the URL',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl, '/?view=side');
      if ((await checkedMode(page)) !== 'side' || !(await page.locator('.vp-pair').count())) throw new Error('?view=side did not open Side by side');
      await slider(page).focus();
      await page.keyboard.press('Home');
      await expectSelected(page, defaultFixture, 0);
      const q = new URL(page.url()).searchParams;
      if ((await checkedMode(page)) !== 'side' || q.get('view') !== 'side') throw new Error(`after Home: mode ${await checkedMode(page)}, URL ${page.url()}`);
      for (const view of ['onion', 'zoom']) {
        await openReady(page, baseUrl, `/?view=${view}`);
        if ((await checkedMode(page)) !== 'slider' || new URL(page.url()).searchParams.has('view')) throw new Error(`?view=${view}: mode ${await checkedMode(page)}, URL ${page.url()}`);
      }
      return { notes: [`side kept on Home (${q.toString()})`, '?view=onion and ?view=zoom -> Slider, view dropped'] };
    },
  },
  {
    name: 'compare-missing',
    description: 'A compare mode on a change with a capture that has no picture shows Single, with the reason, and keeps the chosen mode',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const f = fixtures.find((x) => x.id === 'rust-lang')!;
      const ts = f.snapshots.find((s) => s.shot?.status === 'failed')!.ts;
      const e = timelineOf(f).entries.find((x) => x.to === ts || x.from === ts)!;
      await openReady(page, baseUrl, `/?sample=${f.id}&change=${e.from}-${e.to}`);
      const note = (await page.locator('.vp-note').textContent()) ?? '';
      if (!note.includes('Slider needs a picture of both captures') || (await page.locator('.vp-cmp').count()) || (await checkedMode(page)) !== 'slider') throw new Error(`note "${note}"`);
      return { notes: [note] };
    },
  },
  {
    name: 'play',
    description: 'Play (never on its own) switches to Single and steps one capture per 1.2 s, silently; a key press stops it and says where; mid-play shot',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const button = page.locator('.vp-play');
      const start = await shownIndex(page);
      await page.waitForTimeout(PLAY_MS + 200);
      if ((await shownIndex(page)) !== start || (await button.getAttribute('data-playing')) !== null) throw new Error('Play started on its own');
      await button.click();
      const from = await shownIndex(page);
      const quiet = await page.locator('.diff-nav [aria-live]').getAttribute('aria-live');
      const pause = await page.getByRole('button', { name: 'Pause time-lapse', exact: true }).count();
      if (pause !== 1 || (await button.getAttribute('data-playing')) === null || (await button.getAttribute('aria-pressed')) !== null || (await checkedMode(page)) !== 'single' || quiet !== 'off') throw new Error(`playing: "${await button.textContent()}" (${pause} "Pause time-lapse"), mode ${await checkedMode(page)}, nav live ${quiet}`);
      // The playhead (the shaded span and its start line) slides linearly through each 1.2 s hold.
      const slide = await page.locator('.rb-span').evaluate((el) => `${getComputedStyle(el).transitionDuration} ${getComputedStyle(el).transitionTimingFunction}`);
      if (slide !== '1.2s linear') throw new Error(`playhead transition "${slide}" while playing`);
      await page.waitForTimeout(PLAY_MS * 3 + 300);
      const at = await shownIndex(page);
      if (at !== from + 3) throw new Error(`after 3 steps at #${at + 1}, expected #${from + 4}`);
      if (await page.evaluate(() => document.activeElement?.matches('.vp-play')) === false) throw new Error('Play moved focus');
      await page.keyboard.press('Shift');
      await page.waitForTimeout(PLAY_MS + 200);
      const status = (await page.locator('.vpane .vp-said').textContent()) ?? '';
      const named = await page.getByRole('button', { name: 'Play time-lapse', exact: true }).count();
      if (named !== 1 || (await shownIndex(page)) !== at || (await button.getAttribute('data-playing')) !== null || !status.startsWith('Stopped at capture')) throw new Error(`a key did not stop Play (status "${status}")`);
      await button.click();
      await page.waitForTimeout(PLAY_MS + 300);
      return { notes: [`from #${from + 1} (start #${start + 1}) to #${at + 1} in 3 steps`, `playhead slide while playing: ${slide}`, `stopped by a key: "${status}"`, 'shot mid-play'] };
    },
  },
  {
    name: 'play-reduced',
    description: 'Under reduced motion Play still steps on request, with no cross-fade (no animations or transitions on the pictures)',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openReady(page, baseUrl);
      await page.locator('.vp-play').click();
      const from = await shownIndex(page);
      await page.waitForTimeout(PLAY_MS + 300);
      const m = await page.evaluate(() => ({ anims: document.querySelector('.vpane')!.getAnimations({ subtree: true }).length, prev: getComputedStyle(document.querySelector('.vp-frame')!).backgroundImage }));
      if ((await shownIndex(page)) !== from + 1 || m.anims || m.prev !== 'none') throw new Error(`step ${from} -> ${await shownIndex(page)}, ${m.anims} animations, backdrop ${m.prev}`);
      await page.locator('.vp-play').click();
      return { notes: [`stepped #${from + 1} -> #${from + 2} with no animation`] };
    },
  },
  // Review-only: every recorded thumbnail of a sample with its status, to inspect the pictures by eye.
  ...fixtures.map((f): Flow => ({
    name: `shots-contact-sheet-${f.id}`,
    description: `${f.id}: every capture's thumbnail (or "no picture"), frame number, date, status`,
    viewports: ['desktop'],
    bypassCsp: true,
    clip: '#contact-sheet',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const cells = f.snapshots.map((s, i) => {
        const label = `#${String(i + 1).padStart(2, '0')} ${formatTimestampShort(s.ts)} ${s.shot?.status ?? 'not recorded'}${s.shot?.redacted ? `, ${s.shot.redacted} hidden` : ''}`;
        const pic = s.shot?.file
          ? `<img src="/samples/${f.id}/${s.shot.file}.thumb.webp" width="320" height="200" alt="${f.label}, ${formatTimestampLong(s.ts)}, top of page">`
          : '<div style="width:316px;height:196px;border:2px dashed">no picture</div>';
        return `<figure style="margin:0">${pic}<figcaption style="font:13px/1.6 monospace">${label}</figcaption></figure>`;
      });
      const shown = await page.evaluate(async (html) => {
        document.getElementById('root')!.style.display = 'none';
        document.body.insertAdjacentHTML('beforeend', html);
        const imgs = [...document.querySelectorAll<HTMLImageElement>('#contact-sheet img')];
        await Promise.all(imgs.map((i) => i.decode()));
        return imgs.filter((i) => i.naturalWidth === 320 && i.naturalHeight === 200).length;
      }, `<main id="contact-sheet" style="display:grid;grid-template-columns:repeat(3,320px);gap:16px;padding:16px;width:max-content;background:#fff;color:#111"><h1 style="grid-column:1/-1;font:600 18px system-ui;margin:0">${f.label}: ${f.snapshots.length} captures</h1>${cells.join('')}</main>`);
      const want = f.snapshots.filter((s) => s.shot?.file).length;
      if (shown !== want) throw new Error(`${shown} of ${want} thumbnails decoded at 320×200`);
      return { notes: [`${f.id}: ${shown} thumbnails, ${f.snapshots.length - want} without a picture`] };
    },
  })),
  {
    name: 'examples-deeplinks',
    description: 'Every sample link in examples/README.md opens the sample, the change (its dates in the link text) and the compare mode it names',
    viewports: ['wide'],
    shot: 'examples-gallery',
    firstView: true,
    async run({ page, baseUrl }) {
      const md = readFileSync(new URL('../examples/README.md', import.meta.url), 'utf8');
      const links = [...md.matchAll(/\[(\d{4}·\d\d·\d\d) → (\d{4}·\d\d·\d\d)[^\]]* in (Slider|Side by side|Single)\]\(https:\/\/pagelapse\.geekplux\.com(\/\?sample=[^)]+)\)/g)];
      const MODE: Record<string, string> = { Slider: 'slider', 'Side by side': 'side', Single: 'single' };
      const all = md.match(/\]\(https:\/\/pagelapse\.geekplux\.com\/\?sample=/g)?.length ?? 0;
      if (all !== 7 || links.length !== all) throw new Error(`examples/README.md: ${links.length} of ${all} sample links parsed, expected 7`);
      const notes: string[] = [];
      for (const [, from, to, mode, path] of links) {
        const q = new URL(path!, baseUrl).searchParams;
        const f = fixtures.find((x) => x.id === q.get('sample'))!;
        await openReady(page, baseUrl, path);
        const m = await page.evaluate(() => ({
          label: document.querySelector('#sample-label')?.textContent?.trim(),
          dates: [...document.querySelectorAll('#change-heading time [aria-hidden="true"]')].map((t) => t.textContent?.trim()),
          mode: document.querySelector<HTMLInputElement>('input[name="vp-mode"]:checked')?.value,
        }));
        const problems = [
          m.label !== f?.label && `sample "${m.label}"`,
          // The gallery writes dates as YYYY·MM·DD; the app shows them as `17 Mar 2014`.
          m.dates.join() !== [from, to].map((d) => formatTimestampShort(`${d!.replace(/\D/g, '')}000000`)).join() && `change ${m.dates.join(' → ')}`,
          m.mode !== MODE[mode!] && `mode ${m.mode}`,
        ].filter(Boolean);
        if (problems.length) throw new Error(`${path}: ${problems.join('; ')}, expected ${from} → ${to} in ${mode}`);
        notes.push(`${q.get('sample')} ${from} → ${to} in ${mode}`);
      }
      // The shot: the gallery's Wikipedia redesign link (the git-scm decade compare is the hero shot already).
      await openReady(page, baseUrl, links.find((l) => l[4]!.includes('wikipedia') && l[3] === 'Slider')![4]);
      await page.waitForSelector('[data-visual-ready="true"]', { timeout: 5_000 });
      return { notes: [`${links.length} links`, ...notes] };
    },
  },
  {
    name: 'hero-gif-frames',
    description: 'For scripts/render-hero-gif.ts: the decade compare, then one frame per Play step, written to .cache/hero-gif/',
    selfTest: true,
    viewports: ['wide'],
    firstView: true,
    async run({ page, baseUrl }) {
      const dir = new URL('../.cache/hero-gif/', import.meta.url);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const shots: number[] = [];
      const shoot = async (i: number) => {
        await settle(page);
        writeFileSync(new URL(`frame-${String(shots.length).padStart(2, '0')}.png`, dir), await page.screenshot());
        shots.push(i);
      };
      await openReady(page, baseUrl);
      await page.waitForSelector('[data-visual-ready="true"]', { timeout: 5_000 });
      await shoot(-1);
      await page.locator('.vp-play').click();
      const last = defaultFixture.snapshots.length - 1;
      for (let i = 0; i <= last; i++) {
        await page.locator(`.rb-th[aria-current="true"][data-ts="${defaultFixture.snapshots[i]!.ts}"]`).waitFor({ timeout: PLAY_MS * 3 });
        await shoot(i);
      }
      return { notes: [`${shots.length} frames: the decade compare, then captures #01-#${last + 1}`] };
    },
  },
  {
    name: '__fail',
    description: 'Self-test: always fails, to prove cleanup and a non-zero exit',
    selfTest: true,
    async run() {
      throw new Error('__fail: deliberate failure (self-test)');
    },
  },
  {
    name: '__hang',
    description: 'Self-test: waits 60 s, so SIGINT can be sent mid-run',
    selfTest: true,
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      return {};
    },
  },
];
