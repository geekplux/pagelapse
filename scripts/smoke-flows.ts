// Flow registry for scripts/smoke.ts. Each flow runs once per viewport in a
// fresh browser context; the runner takes the screenshot after `run` resolves.
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { ARCHIVES } from '../src/archive/archives.ts';
import { describeChange } from '../src/app/describe.ts';
import { collapseUnchanged } from '../src/app/diff/rows.ts';
import { stepIndex, tsToMs } from '../src/app/timeline/scale.ts';
import { fixtureToSnapshots, parseSampleFixture } from '../src/core/fixture.ts';
import { buildTimeline, trivialEntries } from '../src/core/timeline.ts';
import { formatTimestampLong, formatTimestampShort, timestampToIso } from '../src/core/timestamp.ts';
import { viewCaptureUrl } from '../src/core/url.ts';
import { type Theme, palette } from '../src/design/palette.ts';
import { changeForCapture, shotAlt, shotSrc } from '../src/app/visual/visualState.ts';

export interface FlowContext {
  page: Page;
  baseUrl: string;
  viewport: 'desktop' | 'mobile';
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
  /** Viewports to run in (default: desktop and mobile). */
  viewports?: FlowContext['viewport'][];
  run: (ctx: FlowContext) => Promise<FlowResult>;
}

/** Opens `path` and waits until the app reports ready; returns time-to-ready. */
export async function openReady(page: Page, baseUrl: string, path = '/'): Promise<number> {
  await page.goto(new URL(path, baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-ready="true"]', { timeout: 10_000 });
  return page.evaluate(() => {
    const mark = performance.getEntriesByName('wd:ready')[0];
    return Math.round(mark ? mark.startTime : performance.now());
  });
}

const readJson = (rel: string) => JSON.parse(readFileSync(new URL(`../src/samples/${rel}`, import.meta.url), 'utf8'));
/** Committed samples in registry order (samples.config.json); the first is the default. */
const fixtures = (readJson('samples.config.json') as { id: string }[]).map((c) => parseSampleFixture(readJson(`${c.id}.json`)));
const defaultFixture = fixtures[0]!;
type Fixture = (typeof fixtures)[number];
const timelineOf = (f: Fixture) => buildTimeline(f.url, fixtureToSnapshots(f));
const defaultTimeline = timelineOf(defaultFixture);
const slider = (page: Page) => page.locator('[role="slider"]');
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));

/** The slider value, its valuetext and the list's single `aria-current` all point at change `i` of `f`. */
async function expectSelected(page: Page, f: Fixture, i: number): Promise<string> {
  const { entries } = timelineOf(f);
  const want = describeChange(entries[i]!, i, entries.length);
  await page.locator(`[role="slider"][aria-valuenow="${i + 1}"]`).waitFor({ timeout: 2_000 });
  const text = await slider(page).getAttribute('aria-valuetext');
  if (text !== want) throw new Error(`valuetext "${text}", expected "${want}"`);
  const current = await page.locator('.change').evaluateAll((bs) => bs.flatMap((b, j) => (b.getAttribute('aria-current') === 'true' ? [j] : [])));
  if (current.join() !== String(i)) throw new Error(`list aria-current at [${current.join()}], expected ${i}`);
  return want;
}

/** Centre of marker `i`, scrolled into view inside the strip unless `scroll` is false. */
async function markerAt(page: Page, i: number, scroll = true): Promise<{ x: number; y: number }> {
  const m = page.locator(`.tl-marker[data-index="${i}"]`);
  if (scroll) await m.scrollIntoViewIfNeeded();
  const b = (await m.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function noPageOverflow(page: Page): Promise<void> {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (wide > 0) throw new Error(`page scrolls sideways by ${wide}px (only the timeline strip may)`);
}

/** The pane shows capture `ts` of `f` (its picture, or the "no picture" card), and the filmstrip marks that frame. */
async function expectShown(page: Page, f: Fixture, ts: string): Promise<void> {
  const file = f.snapshots.find((s) => s.ts === ts)?.shot?.file;
  const src = await page.locator('.vp-shot').getAttribute('src');
  if (src !== (file ? shotSrc(f.id, file) : null)) throw new Error(`pane shows ${src}, expected the picture of ${ts}`);
  const current = await page.locator('.frame[aria-current="true"] time').getAttribute('datetime');
  if (current !== timestampToIso(ts)) throw new Error(`filmstrip marks ${current}, expected ${ts}`);
}

/** Presses a currently non-pressed chip and checks the pressed state, heading and capture links all follow. */
async function switchTo(page: Page, f: (typeof fixtures)[number]): Promise<string> {
  const chip = page.locator(`.chip[data-sample="${f.id}"]`);
  if ((await chip.getAttribute('aria-pressed')) !== 'false') throw new Error(`${f.id}: chip was already pressed`);
  await chip.click();
  await page.locator('#sample-label', { hasText: f.label }).waitFor({ timeout: 2_000 });
  await page.waitForSelector('[data-ready="true"]');
  if ((await chip.getAttribute('aria-pressed')) !== 'true') throw new Error(`${f.id}: chip not pressed after click`);
  // Let the sheet's entry fade finish so axe measures settled colours.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  return checkSample(page, f);
}

/** The shown sample's heading, capture count, archive links and provenance match its fixture. */
async function checkSample(page: Page, f: (typeof fixtures)[number]): Promise<string> {
  if ((await page.locator('.chip[aria-pressed="true"]').count()) !== 1) throw new Error('not exactly one pressed chip');
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
 * The list's `aria-current` change sits in the open, full-width changes list after the timeline, which never scrolls
 * inside a box of its own (so no change is clipped there); the page itself has not scrolled from `pageY`.
 */
async function currentInList(page: Page, pageY = 0): Promise<string> {
  const m = await page.evaluate((y) => {
    const pane = document.querySelector<HTMLDetailsElement>('.stage > .changes-pane')!;
    const item = document.querySelector('.changes .change[aria-current="true"]')!.getBoundingClientRect();
    const box = pane.getBoundingClientRect();
    const tl = document.querySelector('.stage > .tl-area')!.getBoundingClientRect();
    const boxes = [pane, ...pane.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY));
    const problems = [
      !pane.open && 'the list is closed',
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

/** Opens the "All changes (N)" disclosure (collapsed on mobile). */
async function openChanges(page: Page): Promise<void> {
  const pane = page.locator('.changes-pane');
  if (!(await pane.evaluate((d) => (d as HTMLDetailsElement).open))) await pane.locator('summary').click();
}

const SPOKEN: Record<string, string> = { added: 'Added:', removed: 'Removed:', modified: 'Changed:', moved: 'Moved:' };

/** The diff of change `i` reads "Added: …" / "Removed: …" / "Changed: …" in document order, every mark styled by line, not hue. */
async function checkDiff(page: Page, f: Fixture, i: number): Promise<string[]> {
  const e = timelineOf(f).entries[i]!;
  const want = collapseUnchanged(e.diff.ops).flatMap((r) => ('op' in r && r.op.type !== 'equal' ? [SPOKEN[r.op.type] ?? r.op.type] : []));
  const got = await page.locator('.diff-body .sr-only').allTextContents();
  if (got.map((t) => t.trim()).join() !== want.join()) throw new Error(`diff prefixes ${got.join()} != ${want.join()}`);
  const bad = await page.evaluate(() => {
    const line = (sel: string, want: string) => [...document.querySelectorAll(sel)].filter((el) => !getComputedStyle(el).textDecorationLine.includes(want)).map(() => sel);
    const sym = [...document.querySelectorAll('.diff-body .db:not([data-op="equal"])')].filter((el) => getComputedStyle(el, '::before').content === 'none');
    return [...line('.diff-body ins', 'underline'), ...line('.diff-body del', 'line-through'), ...line('.db[data-op="added"] .db-t', 'underline'), ...line('.db[data-op="removed"] .db-t', 'line-through'), ...sym.map(() => 'gutter')];
  });
  if (bad.length) throw new Error(`marks without symbol/line style: ${bad.join(', ')}`);
  const links = await page.locator('.change-panel a.cap-out').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel'), a.textContent]));
  const hrefs = [e.from, e.to].map((ts) => viewCaptureUrl(f.source.archive, ts, f.url));
  links.forEach(([href, target, rel, text], k) => {
    if (href !== hrefs[k] || target !== '_blank' || rel !== 'noopener noreferrer' || !text?.includes(formatTimestampLong(k ? e.to : e.from))) throw new Error(`capture link ${k}: ${href} ${target} ${rel} "${text}"`);
  });
  if (links.length !== 2) throw new Error(`${links.length} capture links in the diff header`);
  // What a screen reader gets: the accessibility tree of the diff, in document order.
  const tree = (await page.locator('.diff-body').ariaSnapshot()).split('\n').map((l) => l.replace(/^[\s-]*(?:(?:paragraph|blockquote|code|text):)?\s*"?/, '').replace(/"$/, ''));
  const spoken = tree.filter((l) => /^(Added|Removed|Changed|Moved):/.test(l));
  if (spoken.map((l) => l.split(':')[0]).join() !== want.map((w) => w.slice(0, -1)).join()) throw new Error(`a11y tree reads ${spoken.join(' | ')}`);
  return [`${want.length} marked blocks in order; a11y dump: ${spoken.map((l) => l.slice(0, 60)).join(' | ')}`];
}

export const flows: readonly Flow[] = [
  {
    name: 'sample-default',
    description: 'First load renders the default sample (dates, theme, self-hosted fonts)',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl, scheme }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      await openChanges(page);
      for (const { to: ts } of defaultTimeline.entries) {
        const time = page.locator(`.changes time[datetime="${timestampToIso(ts)}"]`);
        await time.waitFor({ state: 'visible', timeout: 2_000 });
        const shown = (await time.locator('[aria-hidden="true"]').textContent())?.trim();
        const spoken = (await time.locator('.sr-only').textContent())?.trim();
        if (shown !== formatTimestampShort(ts) || spoken !== formatTimestampLong(ts)) {
          throw new Error(`change ${ts}: got "${shown}" / "${spoken}"`);
        }
      }
      const { bg, fonts } = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = [...document.fonts].filter((f) => f.status === 'loaded');
        return { bg: getComputedStyle(document.body).backgroundColor, fonts: loaded.map((f) => `${f.family} ${f.style}`) };
      });
      const paper = palette[scheme].paper.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16));
      if (bg !== `rgb(${paper.join(', ')})`) throw new Error(`${scheme}: body background ${bg}, expected ${palette[scheme].paper}`);
      if (fonts.length < 2) throw new Error(`self-hosted Fraunces not loaded (loaded: ${fonts.join(', ') || 'none'})`);
      return { timeToReadyMs, notes: [`${defaultTimeline.entries.length} change dates visible`, `${scheme} paper ${bg}`, `fonts: ${fonts.join(', ')}`] };
    },
  },
  {
    name: 'samples-switch',
    description: 'Each chip, pressed while not pressed, switches the pressed state, heading, capture links and footer',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const notes = [await checkSample(page, defaultFixture)];
      // Visit every other sample, then come back to the default: every click is on a non-pressed chip.
      for (const f of [...fixtures.slice(1), defaultFixture]) notes.push(await switchTo(page, f));
      return { notes };
    },
  },
  ...fixtures.map(
    (f): Flow => ({
      name: `sample-${f.id}`,
      description: `The ${f.id} sample renders from its bundled fixture`,
      async run({ page, baseUrl }) {
        const timeToReadyMs = await openReady(page, baseUrl);
        return { timeToReadyMs, notes: [f === defaultFixture ? await checkSample(page, f) : await switchTo(page, f)] };
      },
    }),
  ),
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
    description: 'Tab order header -> sample chips -> content -> footer, a visible ring on every stop, chips toggle by key',
    suffix: '-kbd',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const regions = ['header', 'chips', 'main', 'footer'];
      const stops: { region: string; name: string; ring: boolean }[] = [];
      for (let i = 0; i < 100; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const region = el.classList.contains('chip') ? 'chips' : (el.closest('header, main, footer')?.tagName.toLowerCase() ?? 'other');
          const ring = cs.outlineStyle === 'solid' && parseFloat(cs.outlineWidth) >= 2 && cs.boxShadow !== 'none';
          return { region, name: (el.textContent ?? '').trim().slice(0, 40), ring };
        });
        if (!stop) break;
        stops.push(stop);
      }
      const order = stops.map((s) => regions.indexOf(s.region));
      if (order.some((r, i) => r < 0 || (i > 0 && r < order[i - 1]!)) || new Set(order).size !== regions.length) {
        throw new Error(`tab order: ${stops.map((s) => `${s.region}:${s.name}`).join(' | ')}`);
      }
      const ringless = stops.filter((s) => !s.ring);
      if (ringless.length) throw new Error(`no focus ring on: ${ringless.map((s) => s.name).join(', ')}`);
      // The chip toggles from the keyboard and stays the single pressed one.
      const chip = page.locator('.chip').first();
      await chip.focus();
      for (const key of ['Space', 'Enter']) {
        await page.keyboard.press(key);
        await page.waitForSelector('[data-ready="true"]');
        if ((await chip.getAttribute('aria-pressed')) !== 'true') throw new Error(`${key} did not press the chip`);
      }
      if ((await page.locator('.chip[aria-pressed="true"]').count()) !== 1) throw new Error('not exactly one pressed chip');
      // The switch is announced politely while focus stays on the chip.
      const status = (await page.locator('p[role="status"]').textContent())?.trim() ?? '';
      if (!status.startsWith('Showing: ')) throw new Error(`no sample-switch announcement (status: "${status}")`);
      if (!(await chip.evaluate((el) => el === document.activeElement))) throw new Error('focus left the chip after switching');
      return { notes: [`${stops.length} stops: ${stops.map((s) => `${s.region}:${s.name}`).join(' | ')}`, `announced: ${status}`] };
    },
  },
  {
    name: 'timeline',
    description: 'Default sample timeline: a marker per change, one radius step per magnitude (majors ringed), latest change selected, SVG hidden',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      const { entries } = defaultTimeline;
      const said = await expectSelected(page, defaultFixture, entries.length - 1);
      const rs = await page.locator('.tl-marker').evaluateAll((cs) => cs.map((c) => Number(c.getAttribute('r'))));
      if (rs.length !== entries.length) throw new Error(`${rs.length} markers for ${entries.length} changes`);
      // Size alone separates the classes: one radius per magnitude, rising with it, and rising with score.
      const order = ['minor', 'moderate', 'major'];
      const byMag = new Map<string, Set<number>>();
      entries.forEach((e, i) => byMag.set(e.significance.magnitude, (byMag.get(e.significance.magnitude) ?? new Set()).add(rs[i]!)));
      const steps = order.filter((m) => byMag.has(m)).map((m) => [m, [...byMag.get(m)!]] as const);
      if (steps.some(([, r]) => r.length !== 1)) throw new Error(`marker radius varies within a magnitude: ${JSON.stringify(steps)}`);
      if (steps.some(([, [r]], i) => i > 0 && r! <= steps[i - 1]![1][0]!)) throw new Error(`marker radius does not rise with magnitude: ${JSON.stringify(steps)}`);
      const byScore = entries.map((e, i) => [e.significance.score, rs[i]!] as const).sort((a, b) => a[0] - b[0]);
      if (byScore.some(([, r], i) => i > 0 && r < byScore[i - 1]![1])) throw new Error('marker radius is not monotone in score');
      const majors = entries.filter((e) => e.significance.magnitude === 'major').length;
      const rings = await page.locator('.tl-marker-ring').count();
      if (rings !== majors) throw new Error(`${rings} inner rings for ${majors} major changes`);
      if ((await page.locator('.tl-slider svg').getAttribute('aria-hidden')) !== 'true') throw new Error('timeline SVG is not aria-hidden');
      await noPageOverflow(page);
      return { timeToReadyMs, notes: [`${rs.length} markers, r by magnitude ${steps.map(([m, [r]]) => `${m} ${r}`).join(' / ')} px, ${rings} ringed`, said] };
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
      const tip = (await page.locator('.tl-tip').textContent()) ?? '';
      if (!tip.includes(entries[pageUp]!.ruleSummary)) throw new Error(`no focus tooltip for the selected change ("${tip}")`);
      // Escape dismisses the focus tooltip without moving the selection; the next key brings it back.
      await page.keyboard.press('Escape');
      await page.locator('.tl-tip').waitFor({ state: 'detached', timeout: 2_000 });
      await expectSelected(page, defaultFixture, pageUp);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await page.locator('.tl-tip').waitFor({ timeout: 2_000 });
      return { notes: [`${steps.map(([k, i]) => `${k}->${i + 1}`).join(', ')}; ${said.size} distinct valuetexts`] };
    },
  },
  {
    name: 'timeline-pointer',
    description: 'Clicking a marker selects it, dragging snaps to the nearest change, hovering shows the tooltip',
    shot: 'timeline',
    suffix: '-tooltip',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      await settle(page);
      const a = await markerAt(page, 1);
      await page.mouse.click(a.x, a.y);
      await expectSelected(page, defaultFixture, 1);
      if (!(await slider(page).evaluate((el) => el === document.activeElement))) throw new Error('click did not focus the slider');
      // The pointer is captured, so the drag may end outside the visible part of the strip.
      const b = await markerAt(page, 4, false);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x + 3, b.y - 2, { steps: 8 });
      await page.mouse.up();
      await expectSelected(page, defaultFixture, 4);
      const c = await markerAt(page, 2);
      await page.mouse.move(c.x, c.y);
      const tip = page.locator('.tl-tip');
      await tip.waitFor({ timeout: 2_000 });
      if (!((await tip.textContent()) ?? '').includes(defaultTimeline.entries[2]!.ruleSummary)) throw new Error('hover tooltip shows the wrong change');
      // WCAG 1.4.13: the tip is hoverable (moving onto it keeps it) and Escape dismisses it.
      const t = (await tip.boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 6 });
      await page.waitForTimeout(400); // longer than the hover grace period
      if (!(await tip.isVisible())) throw new Error('tooltip vanished when the pointer moved onto it');
      await page.keyboard.press('Escape');
      await tip.waitFor({ state: 'detached', timeout: 2_000 });
      await page.mouse.move(c.x + 1, c.y);
      await tip.waitFor({ timeout: 2_000 });
      return { notes: ['click -> 2, drag -> 5, hover tooltip on 3, hoverable, Escape hides it'] };
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
      const ticks = await page.locator('.tl-trivial').count();
      if (ticks !== t.trivialCaptures.length) throw new Error(`${ticks} hollow ticks for ${t.trivialCaptures.length} trivial captures`);
      await openReady(page, baseUrl, '/?sample=git-scm&change=bogus');
      await expectSelected(page, f, t.entries.length - 1);
      // Invalid query values are replaced in the address bar by the state actually shown.
      const latest = (x: Fixture) => { const l = timelineOf(x).entries.at(-1)!; return `${l.from}-${l.to}`; };
      if (new URL(page.url()).search !== `?sample=git-scm&change=${latest(f)}`) throw new Error(`bogus change not replaced: ${page.url()}`);
      await openReady(page, baseUrl, '/?sample=nope');
      if (new URL(page.url()).search !== `?sample=${defaultFixture.id}`) throw new Error(`bogus sample not replaced: ${page.url()}`);
      await page.setViewportSize({ width: 320, height: 800 });
      await noPageOverflow(page);
      // Let the last load's entry fade finish so axe measures settled colours.
      await settle(page);
      return { timeToReadyMs, notes: [said, `${ticks} hollow ticks; bogus change -> latest; no page overflow at 320 px`] };
    },
  },
  {
    name: 'diff-default',
    description: 'The latest change\'s diff: capture links, hidden prefixes in order, symbols and line styles, < 1,500 nodes for the largest change, list collapsed on mobile',
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
      const timeToReadyMs = await openReady(page, baseUrl);
      const notes = await checkDiff(page, defaultFixture, defaultTimeline.entries.length - 1);
      const open = await page.locator('.changes-pane').evaluate((d) => (d as HTMLDetailsElement).open);
      if (open !== (viewport === 'desktop')) throw new Error(`changes list open=${open} on ${viewport}`);
      const summary = (await page.locator('.changes-pane summary').textContent())?.trim();
      if (summary !== `All changes (${defaultTimeline.entries.length})`) throw new Error(`summary "${summary}"`);
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
      // Previous / Next sit beside the picture, before the diff in the tab order.
      await page.locator('.diff-nav .btn').first().focus();
      await page.keyboard.press('Enter');
      await expectSelected(page, f, n - 2);
      await checkDiff(page, f, n - 2);
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
    description: 'A change with structure edits: expanding every unchanged run and long block shows the whole later page',
    async run({ page, baseUrl }) {
      const e = defaultTimeline.entries.at(-2)!;
      await openReady(page, baseUrl, `/?change=${e.from}-${e.to}`);
      const structure = await page.locator('.diff-structure li').allTextContents();
      if (structure.length !== e.record.headingsAdded.length + e.record.headingsRemoved.length + (e.diff.titleChanged ? 1 : 0)) throw new Error(`structure list: ${structure.join(' | ')}`);
      while (await page.locator('.db-gap').count()) await page.locator('.db-gap').first().click();
      for (const b of await page.locator('.db .btn-link').all()) await b.click();
      const blocks = await page.locator('.diff-body .db').count();
      if (blocks !== e.diff.ops.length || (await page.locator('.is-clamped').count())) throw new Error(`${blocks} blocks for ${e.diff.ops.length} ops`);
      return { notes: [`structure: ${structure.join(' | ')}`, `${blocks} blocks shown, none clamped`] };
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
      await page.locator('.diff-nav .btn').first().click();
      await expectSelected(page, f, t.entries.length - 2);
      await page.locator('.change-panel button', { hasText: 'Copy link' }).click();
      await page.locator('.change-panel [role="status"]', { hasText: 'Link copied' }).waitFor({ timeout: 2_000 });
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      if (copied !== page.url() || !copied.includes('change=')) throw new Error(`copied "${copied}", page at ${page.url()}`);
      await openReady(page, baseUrl, new URL(copied).pathname + new URL(copied).search);
      await expectSelected(page, f, t.entries.length - 2);
      // "Show trivial edits" turns the hollow ticks into selectable, labelled entries.
      const trivial = trivialEntries(t);
      await page.getByLabel('Show trivial edits').check();
      const marks = await page.locator('.tl-marker[data-magnitude="trivial"]').count();
      const items = await page.locator('.changes li').count();
      if (marks !== trivial.length || items !== t.entries.length + trivial.length) throw new Error(`${marks} trivial markers, ${items} list items`);
      await openChanges(page);
      await page.locator('.change', { hasText: 'trivial' }).first().click();
      await page.locator('.panel-kicker', { hasText: 'trivial' }).waitFor({ timeout: 2_000 });
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
    description: 'favicon.svg at 16, 32 and 64 px on paper and on ink',
    shot: 'brand-favicon',
    viewports: ['desktop'],
    clip: '#brand-sheet',
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const sizes = [16, 32, 64];
      const { paper, ink } = palette.light;
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
      return { notes: [`favicon.svg rendered at ${sizes.join(', ')} px on paper and ink`] };
    },
  },
  {
    name: 'visual-default',
    description: 'The hero: featured change picture, summary and filmstrip thumbnails above the fold; ready <= 1,000 ms, visual-ready <= 1,500 ms, CLS < 0.02, first-view pictures <= 160 KB',
    shot: 'hero',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl, viewport }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      await page.waitForSelector('[data-visual-ready="true"]', { timeout: 5_000 });
      const [from, to] = defaultFixture.featured!.split('-') as [string, string];
      await expectShown(page, defaultFixture, to);
      const alt = await page.locator('.vp-shot').getAttribute('alt');
      if (alt !== shotAlt(defaultFixture.label, { from, to }, to) || !alt.includes('(After)')) throw new Error(`alt "${alt}"`);
      if ((await page.locator('.frame').count()) !== defaultFixture.snapshots.length) throw new Error('not one frame per capture');
      const pressed = await page.locator('.vp-side[aria-pressed="true"]').textContent();
      if (!pressed?.includes('After')) throw new Error(`pressed side "${pressed}"`);
      if (!page.url().endsWith('/') || new URL(page.url()).search) throw new Error(`first view rewrote the URL: ${page.url()}`);
      await page.waitForTimeout(500);
      const m = await page.evaluate(async () => {
        const cls = await new Promise<number>((done) =>
          new PerformanceObserver((l) => done(l.getEntries().reduce((n, e) => n + ((e as unknown as { hadRecentInput: boolean }).hadRecentInput ? 0 : (e as unknown as { value: number }).value), 0))).observe({ type: 'layout-shift', buffered: true }),
        ).then((v) => v, () => 0);
        const pics = performance.getEntriesByType('resource').filter((r) => r.name.includes('/samples/')) as PerformanceResourceTiming[];
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        return {
          visual: Math.round(performance.getEntriesByName('wd:visual-ready')[0]!.startTime),
          cls,
          bytes: pics.reduce((n, r) => n + r.encodedBodySize, 0),
          count: pics.length,
          fold: [box('.vp-mat').bottom, box('.panel-summary').bottom, box('.frame :is(img, .frame-none)').bottom],
          paneWidth: box('.vp-mat').width,
        };
      });
      const problems = [
        timeToReadyMs > 1000 && `ready ${timeToReadyMs} ms > 1,000`,
        m.visual > 1500 && `visual-ready ${m.visual} ms > 1,500`,
        m.cls >= 0.02 && `CLS ${m.cls.toFixed(3)}`,
        m.bytes > 160_000 && `first-view pictures ${m.bytes} B > 160 KB`,
        viewport === 'desktop' && m.fold.some((y) => y > 800) && `stage below the fold: ${m.fold.map(Math.round).join(', ')}`,
        viewport === 'mobile' && m.paneWidth < 300 && `pane only ${m.paneWidth}px wide on mobile`,
      ].filter(Boolean);
      if (problems.length) throw new Error(problems.join('; '));
      await noPageOverflow(page);
      return { timeToReadyMs, notes: [`featured ${from}-${to}`, `visual-ready ${m.visual} ms, CLS ${m.cls.toFixed(4)}`, `first-view pictures: ${m.count} files, ${m.bytes} B`, `fold (mat, summary, filmstrip thumbnails): ${m.fold.map(Math.round).join(', ')}`] };
    },
  },
  {
    name: 'changes-list-follows',
    description: 'Desktop: the full-width changes list after the timeline marks the selected change after load, Previous, the filmstrip and the timeline; it has no scroll box of its own and the page never scrolls',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const { entries } = defaultTimeline;
      const notes = [`load: ${await currentInList(page)}`];
      // Dispatched clicks: a real click would let Playwright scroll the page to the target first.
      await page.locator('.diff-nav .btn').first().dispatchEvent('click');
      await expectSelected(page, defaultFixture, entries.length - 2);
      notes.push(`Previous: ${await currentInList(page)}`);
      await page.locator('.frame').first().dispatchEvent('click');
      await expectSelected(page, defaultFixture, 0);
      notes.push(`filmstrip #01: ${await currentInList(page)}`);
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
        await openReady(page, baseUrl);
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
    name: 'visual-filmstrip-keyboard',
    description: 'Tab to the filmstrip (one stop), Home, Right x3, Enter: the pane, the timeline valuetext and the list follow',
    shot: 'filmstrip',
    suffix: '-kbd',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const stops = new Set<string>();
      for (let k = 0; k < 60 && !(await page.evaluate(() => document.activeElement?.classList.contains('frame'))); k++) {
        await page.keyboard.press('Tab');
        stops.add(await page.evaluate(() => document.activeElement?.className ?? ''));
      }
      for (const key of ['Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter']) await page.keyboard.press(key);
      const ts = defaultFixture.snapshots[3]!.ts;
      await page.locator(`.frame[aria-current="true"] time[datetime="${timestampToIso(ts)}"]`).waitFor({ timeout: 2_000 });
      await expectShown(page, defaultFixture, ts);
      const said = await expectSelected(page, defaultFixture, changeForCapture(defaultTimeline.entries, ts));
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.classList.contains('frame'))) throw new Error('the filmstrip has more than one tab stop');
      await page.keyboard.press('Shift+Tab');
      return { notes: [`frame #04 shown (${ts}); ${said}`, `tab stops before the strip: ${[...stops].join(' | ')}`] };
    },
  },
  {
    name: 'visual-timeline-sync',
    description: 'Timeline keys swap the picture and the filmstrip frame; Before / After flips sides and is kept while scrubbing (?at=)',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const { entries } = defaultTimeline;
      await slider(page).focus();
      for (const [key, i] of [['Home', 0], ['ArrowRight', 1]] as const) {
        await page.keyboard.press(key);
        await expectSelected(page, defaultFixture, i);
        await expectShown(page, defaultFixture, entries[i]!.to);
      }
      await page.locator('.vp-side', { hasText: 'Before' }).click();
      await expectShown(page, defaultFixture, entries[1]!.from);
      if (new URL(page.url()).searchParams.get('at') !== entries[1]!.from) throw new Error(`no ?at= for Before: ${page.url()}`);
      await slider(page).focus();
      await page.keyboard.press('ArrowRight');
      await expectShown(page, defaultFixture, entries[2]!.from);
      await openReady(page, baseUrl, page.url().replace(baseUrl, '/'));
      await expectShown(page, defaultFixture, entries[2]!.from);
      return { notes: ['Home, Right swap pictures; Before kept on Right; ?at= restores it'] };
    },
  },
  {
    name: 'visual-tab-order',
    description: 'Desktop: the stage tabs in visual order: pane controls, the change card, filmstrip, timeline, changes list, diff',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      const parts = ['vpane', 'side', 'film', 'tl-area', 'changes-pane', 'diff-panel'];
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
      // The diff has stops only when it has collapsed runs or long blocks; the rest always do.
      if (seen.length < 5 || seen.join() !== parts.slice(0, seen.length).join()) throw new Error(`stage tab order: ${seen.join(' -> ')}`);
      // The first stop after the pane's controls is in the change card, beside the picture; the card holds no list.
      await page.locator('.vpane .cap-out').focus();
      await page.keyboard.press('Tab');
      const next = await page.evaluate(() => `${document.activeElement?.closest('.side') ? 'side' : 'elsewhere'}: ${document.activeElement?.textContent?.trim().slice(0, 30)}`);
      if (!next.startsWith('side')) throw new Error(`after "Open capture": ${next}`);
      if (await page.locator('.side .changes').count()) throw new Error('the changes list is inside the side column');
      // The visual order matches: each part starts below the one before it (the side card beside the pane).
      const tops = await page.evaluate((ps) => ps.map((p) => Math.round(document.querySelector(`.stage .${p}`)!.getBoundingClientRect().top)), parts);
      const rows = [tops[0]!, ...tops.slice(2)];
      if (rows.some((t, i) => i > 0 && t <= rows[i - 1]!)) throw new Error(`parts out of visual order: ${parts.map((p, i) => `${p} ${tops[i]}`).join(', ')}`);
      return { notes: [`stage: ${seen.join(' -> ')}`, `after "Open capture": ${next}`, `tops: ${parts.map((p, i) => `${p} ${tops[i]}`).join(', ')}`] };
    },
  },
  {
    name: 'visual-zoom-spacing',
    description: '1024 px at 125% text with WCAG 1.4.12 spacing: the change card is never clipped or scrolled inside the side column, and never spills onto the filmstrip',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      await page.setViewportSize({ width: 1024, height: 768 });
      await openReady(page, baseUrl);
      await page.addStyleTag({
        content: 'html { font-size: 125% !important; } * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
      });
      await settle(page);
      const m = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const side = document.querySelector<HTMLElement>('.stage .side')!;
        const box = side.getBoundingClientRect();
        return {
          twoColumn: box.left > r('.vpane').right,
          sideBottom: box.bottom,
          navBottom: r('.side .diff-nav').bottom,
          paneBottom: r('.vpane').bottom,
          film: r('.film').top,
          clipped: side.scrollHeight - side.clientHeight,
        };
      });
      const problems = [
        !m.twoColumn && 'the stage is not two columns at 1024 px',
        m.clipped > 1 && `the side column hides ${m.clipped}px of the card`,
        m.navBottom > m.sideBottom + 0.5 && `Previous / Next ends at ${Math.round(m.navBottom)}, below the side column (${Math.round(m.sideBottom)})`,
        m.sideBottom > m.film + 0.5 && `side column ends at ${Math.round(m.sideBottom)}, filmstrip starts at ${Math.round(m.film)}`,
        m.paneBottom > m.film + 0.5 && `pane ends at ${Math.round(m.paneBottom)}, filmstrip starts at ${Math.round(m.film)}`,
      ].filter(Boolean);
      if (problems.length) throw new Error(problems.join('; '));
      await noPageOverflow(page);
      return { notes: [`side ends ${Math.round(m.sideBottom)} (pane ${Math.round(m.paneBottom)}) <= filmstrip ${Math.round(m.film)}; nothing clipped`] };
    },
  },
  {
    name: 'stage-fit',
    description: 'Desktop 1024×768 and 1280×800, every sample: the change card beside the picture is fully visible with no inner scrolling; at 1280×800 the filmstrip shows above the fold',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const notes: string[] = [];
      for (const [width, height] of [[1024, 768], [1280, 800]] as const) {
        await page.setViewportSize({ width, height });
        for (const f of fixtures) {
          await openReady(page, baseUrl, `/?sample=${f.id}`);
          await settle(page);
          const m = await page.evaluate(() => {
            const side = document.querySelector<HTMLElement>('.stage .side')!;
            const b = side.getBoundingClientRect();
            const last = side.lastElementChild!.getBoundingClientRect();
            const thumbs = [...document.querySelectorAll('.frame :is(img, .frame-none)')].map((t) => t.getBoundingClientRect());
            return {
              scroll: side.scrollHeight - side.clientHeight,
              top: b.top,
              bottom: Math.max(b.bottom, last.bottom),
              beside: b.left > document.querySelector('.vpane')!.getBoundingClientRect().right,
              thumbTop: Math.max(...thumbs.slice(0, 6).map((t) => t.top)),
              thumbBottom: Math.max(...thumbs.slice(0, 6).map((t) => t.bottom)),
              scrollY,
            };
          });
          const label = `${width}x${height} ${f.id}`;
          const problems = [
            !m.beside && 'the card is not beside the picture',
            m.scroll > 1 && `the side column scrolls by ${m.scroll}px`,
            (m.top < 0 || m.bottom > height) && `the card spans ${Math.round(m.top)}-${Math.round(m.bottom)}, outside the ${height}px viewport`,
            m.scrollY !== 0 && `the page scrolled to ${m.scrollY}`,
            // The strip is seen on first view: its thumbnails start above the fold (all of them end above it for the default, see visual-default).
            width === 1280 && m.thumbTop > height - 16 && `filmstrip thumbnails start at ${Math.round(m.thumbTop)}, below the fold`,
          ].filter(Boolean);
          if (problems.length) throw new Error(`${label}: ${problems.join('; ')}`);
          notes.push(`${label}: card ${Math.round(m.top)}-${Math.round(m.bottom)}, no inner scroll${width === 1280 ? `; thumbnails ${Math.round(m.thumbTop)}-${Math.round(m.thumbBottom)}` : ''}`);
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
      await openReady(page, baseUrl, `/?at=${ts}`);
      await expectShown(page, f, ts);
      await page.locator('.vp-cap .vp-badge', { hasText: "The archive's copy is missing some styles or images" }).waitFor({ timeout: 2_000 });
      const labelled = await page.locator('.frame-partial').count();
      if (labelled !== f.snapshots.filter((s) => s.shot?.status === 'partial').length) throw new Error(`${labelled} filmstrip frames labelled partial`);
      await page.waitForSelector('[data-visual-ready="true"]');
      return { notes: [`${ts}: partial badge in the caption, ${labelled} frames labelled "◐ partial"`] };
    },
  },
  {
    name: 'visual-failed',
    description: 'A capture with no picture shows the hatched card, its reason and "Open capture"; its filmstrip frame says "no picture"',
    viewports: ['desktop'],
    async run({ page, baseUrl }) {
      const f = fixtures.find((x) => x.id === 'rust-lang')!;
      const shot = f.snapshots.find((s) => s.shot?.status === 'failed')!;
      const card = page.locator('.vp-none', { hasText: 'No picture of this capture' });
      await openReady(page, baseUrl, `/?sample=${f.id}&at=${shot.ts}`);
      await card.waitFor({ timeout: 2_000 });
      const href = await page.locator('.vp-cap a').getAttribute('href');
      if (href !== viewCaptureUrl(f.source.archive, shot.ts, f.url)) throw new Error(`open capture link ${href}`);
      if ((await page.locator('.frame-none').count()) !== f.snapshots.filter((s) => !s.shot?.file).length) throw new Error('filmstrip "no picture" frames');
      return { notes: [`${shot.ts}: hatched card (${shot.shot!.reason}), link ${href}`] };
    },
  },
  // Review-only: every recorded thumbnail of a sample with its status, to inspect the pictures by eye.
  ...fixtures.map((f): Flow => ({
    name: `shots-contact-sheet-${f.id}`,
    description: `${f.id}: every capture's thumbnail (or "no picture"), frame number, date, status`,
    viewports: ['desktop'],
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
