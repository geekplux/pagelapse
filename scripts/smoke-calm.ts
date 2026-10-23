// Calm-layout smoke flows (phase 17, PLAN section 4 "Calm layout", D35). `calm-audit:<view>` measures the first
// viewport of each audited view at 1440×900 and 390×844 against the caps and saves a first-view shot of it (the
// "calm shots"). Set CALM_BASELINE=1 to report without failing (the before/after baseline run).
import type { Page } from 'playwright-core';
import { mockFromSample } from '../test/fixtures/api/live.ts';
import { assertAxeClean } from './smoke-a11y.ts';
import { type Flow, type FlowContext, openDisclosure, openReady } from './smoke-flows.ts';
import { framesPainted, mockApi, openLive } from './smoke-live.ts';

const baseline = !!process.env.CALM_BASELINE;
/** First-load caps per width: regions, tab stops, framed boxes, eyebrow labels, solid accent fills (section 4 §3). */
const CAPS = { wide: [3, 13, 2, 2, 1], mobile: [3, 12, 2, 1, 1] } as const;
const HEROES = new Set(['hero', 'hero-wikipedia', 'single', 'live-done']);

/** Opens every closed disclosure (native or `aria-expanded`) and returns a function that closes them again. */
export async function openAll(page: Page): Promise<() => Promise<void>> {
  const opened = await page.evaluate(() => {
    const ds = [...document.querySelectorAll('details:not([open])')] as HTMLDetailsElement[];
    for (const d of ds) d.open = true;
    const bs = [...document.querySelectorAll<HTMLElement>('button[aria-expanded="false"]')];
    for (const b of bs) b.click();
    ds.forEach((d, i) => (d.dataset.calmOpened = String(i)));
    bs.forEach((b) => (b.dataset.calmOpened = 'button'));
    return ds.length + bs.length;
  });
  return async () => {
    if (!opened) return;
    await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-calm-opened]')) {
        if (el instanceof HTMLDetailsElement) el.open = false;
        else el.click();
        delete el.dataset.calmOpened;
      }
    });
  };
}

/** Measures the first viewport (runs in the page). */
function measure() {
  const vh = innerHeight;
  const vw = innerWidth;
  const els = [...document.body.querySelectorAll('*')].filter((el): el is HTMLElement => el instanceof HTMLElement);
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && el.checkVisibility({ visibilityProperty: true }) && !el.closest('[inert]');
  };
  const name = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''}`;
  const regions = [...document.querySelectorAll<HTMLElement>('[data-region]')];
  const radios = new Set<string>();
  const stops = els.filter((el) => {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || el.matches('.skip-link, .home-link, a:not([href])') || !seen(el)) return false;
    if (!(el instanceof HTMLInputElement && el.type === 'radio')) return true;
    if (radios.has(el.name)) return false;
    radios.add(el.name);
    return true;
  });
  const paper = getComputedStyle(document.body).backgroundColor;
  const framed = els.filter((el) => {
    if (!seen(el) || el.closest('input, button, select, textarea, summary, .btn, .vp-mat, .film-strip')) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'inline' || r.width < 48 || r.height < 24) return false;
    const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).filter((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none').length;
    return sides >= 3 || cs.boxShadow !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== paper);
  });
  const eyebrow = (el: Element | null) => !!el && /uppercase/.test(getComputedStyle(el).textTransform) && /monospace/.test(getComputedStyle(el).fontFamily);
  const eyebrows = els.filter((el) => seen(el) && eyebrow(el) && !!el.textContent?.trim() && !eyebrow(el.parentElement));
  const probe = document.createElement('i');
  probe.style.color = 'var(--ink)';
  document.body.append(probe);
  const ink = getComputedStyle(probe).color;
  probe.remove();
  const fills = els.filter((el) => seen(el) && getComputedStyle(el).backgroundColor === ink && el.getBoundingClientRect().width >= 16 && el.getBoundingClientRect().height >= 16);
  const mat = document.querySelector('.vpane .vp-mat');
  const m = mat?.getBoundingClientRect();
  const controls = document.querySelector('.controls') ?? document.querySelector('.diff-nav');
  const order = [document.querySelector('.sheet h2'), mat, document.querySelector('.change-panel'), controls];
  const inOrder = order.every(Boolean) && order.every((el, i) => i === 0 || !!(order[i - 1]!.compareDocumentPosition(el!) & Node.DOCUMENT_POSITION_FOLLOWING));
  const status = document.querySelector('.live-status');
  const frames = [...document.querySelectorAll('.film-strip .frame')].map((f) => f.getBoundingClientRect()).filter((r) => r.right > 0 && r.left < vw);
  // The changes list's rows (when open): left edge and top, in DOM order.
  const rows = [...document.querySelectorAll('.changes .change')].filter((el) => el.checkVisibility()).map((el) => el.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.top)] as const);
  return {
    status: status ? seen(status) : null,
    framesBottom: frames.length ? Math.round(Math.max(...frames.map((r) => r.bottom))) : null,
    vh,
    rows,
    regions: regions.length ? regions.filter(seen).map((r) => r.dataset.region!) : null,
    stops: stops.map(name),
    framed: framed.map(name),
    eyebrows: eyebrows.map(name),
    fills: fills.map(name),
    picture: m && { width: Math.round(m.width), top: Math.round(m.top + scrollY), share: Math.round((m.width / vw) * 100) },
    inOrder,
    align: m && controls && Math.round(Math.abs(controls.getBoundingClientRect().bottom - m.bottom)),
    headings: [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => h.checkVisibility()).map((h) => `${h.tagName}:${h.textContent?.trim().slice(0, 30)}`),
  };
}

type View = { name: string; setup: (page: Page, baseUrl: string) => Promise<unknown> };
const sample = (path: string) => async (page: Page, baseUrl: string) => {
  await openReady(page, baseUrl, path);
  await page.waitForSelector('[data-visual-ready="true"]', { timeout: 5_000 });
};
const VIEWS: View[] = [
  { name: 'hero', setup: sample('/') },
  { name: 'hero-wikipedia', setup: sample('/?sample=wikipedia-internet-archive') },
  { name: 'compare-side', setup: sample('/?view=side') },
  { name: 'single', setup: sample('/?view=single') },
  {
    name: 'text-diff',
    async setup(page, baseUrl) {
      await sample('/')(page, baseUrl);
      await page.evaluate(() => {
        const list = document.querySelector<HTMLDetailsElement>('.changes-pane');
        if (list) list.open = true;
        scrollTo(0, document.getElementById('diff')!.getBoundingClientRect().top + scrollY - 16);
      });
    },
  },
  {
    name: 'live-running',
    async setup(page, baseUrl) {
      await mockApi(page, { snapshot: (i) => (i < 6 ? {} : { delay: null }) });
      await openLive(page, baseUrl, 'git-scm.com', 'snapshots');
      await page.waitForFunction(() => document.querySelector('.live-status p')?.textContent?.includes('capture 7 of 14'), null, { timeout: 10_000 });
    },
  },
  {
    name: 'live-done',
    async setup(page, baseUrl) {
      await mockApi(page);
      await openLive(page, baseUrl, 'git-scm.com', 'done');
      await framesPainted(page, '.vpane');
    },
  },
  {
    name: 'live-empty',
    async setup(page, baseUrl) {
      await mockApi(page, { captures: 'no_captures' });
      await openLive(page, baseUrl, 'git-scm.com', 'error');
    },
  },
  {
    name: 'live-no-meaningful',
    async setup(page, baseUrl) {
      await mockApi(page, { data: () => mockFromSample('git-scm', { same: true }) });
      await openLive(page, baseUrl, 'git-scm.com', 'done');
    },
  },
  {
    name: 'live-error-ratelimited',
    async setup(page, baseUrl) {
      await mockApi(page, { captures: 'archive_rate_limited' });
      await openLive(page, baseUrl, 'git-scm.com', 'error');
    },
  },
  { name: 'live-invalid-url', setup: (page, baseUrl) => openReady(page, baseUrl, '/?url=ftp%3A%2F%2Fexample.org') },
];

/** Settles finite animations (the live dot pulses forever, so the wait is capped). */
const settled = (page: Page) => page.evaluate(() => Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 1_500))]));

async function audit(view: View, { page, baseUrl, viewport }: FlowContext) {
  await view.setup(page, baseUrl);
  await settled(page);
  const m = await page.evaluate(measure);
  const wide = viewport === 'wide';
  const w = page.viewportSize()!.width;
  const counts = [m.regions?.length ?? NaN, m.stops.length, m.framed.length, m.eyebrows.length, m.fills.length];
  const row = `calm-audit ${view.name} ${w}: regions ${m.regions ? `${m.regions.length} (${m.regions.join(',')})` : 'n/a'} · tab stops ${counts[1]} · framed ${counts[2]} · eyebrows ${counts[3]} · accent fills ${counts[4]}${m.picture ? ` · picture ${m.picture.width} px (${m.picture.share}%) top ${m.picture.top}` : ''}${m.align !== undefined && m.align !== null ? ` · controls-to-picture ${m.align} px` : ''}`;
  console.error(row);
  const caps = CAPS[wide ? 'wide' : 'mobile'];
  const labels = ['regions', 'tab stops', 'framed boxes', 'eyebrow labels', 'accent fills'];
  const problems = counts.flatMap((n, i) => (n > caps[i]! || Number.isNaN(n) ? [`${labels[i]} ${Number.isNaN(n) ? 'n/a' : n} > ${caps[i]}`] : []));
  if (HEROES.has(view.name) && m.picture) {
    if (wide ? m.picture.width < 0.58 * w || m.picture.top > 220 : m.picture.width < w - 32 || m.picture.top > 280) problems.push(`picture ${m.picture.width} px wide at top ${m.picture.top}`);
    if (!m.inOrder) problems.push('hero DOM order is not title → picture → change line → controls');
    if (wide && (m.align ?? 99) > 8) problems.push(`controls row ends ${m.align} px from the picture's bottom`);
  }
  // A running run shows its progress line (counter, bar, Cancel) in the first viewport; on desktop the strip's
  // thumbnails are fully in view too.
  if (view.name === 'live-running') {
    if (!m.status) problems.push('the status line is not in the first viewport');
    if (wide && (m.framesBottom === null || m.framesBottom > m.vh)) problems.push(`filmstrip thumbnails end at ${m.framesBottom} of ${m.vh}`);
  }
  // Carry-over 9e: the opened changes list is one column in chronological order (tops strictly increase).
  if (view.name === 'text-diff') {
    const one = m.rows.length > 1 && m.rows.every(([l, t], i) => i === 0 || (l === m.rows[0]![0] && t > m.rows[i - 1]![1]));
    if (!one) problems.push(`changes list is not one column in order: ${m.rows.map(([l, t]) => `${l},${t}`).join(' ')}`);
  }
  const extra = [
    m.status !== null && `status line in first view: ${m.status}`,
    view.name === 'live-running' && m.framesBottom !== null && `thumbnails end at ${m.framesBottom} of ${m.vh}`,
    m.rows.length > 0 && `changes list rows (left,top): ${m.rows.map(([l, t]) => `${l},${t}`).join(' ')}`,
  ].filter(Boolean) as string[];
  // Axe with every disclosure open (the runner checks the closed state after this).
  const close = await openAll(page);
  const axeOpen = await assertAxeClean(page);
  await close();
  const notes = [row, `stops: ${m.stops.join(' ')}`, `framed: ${m.framed.join(' ')}`, `eyebrows: ${m.eyebrows.join(' ')}`, `fills: ${m.fills.join(' ')}`, `headings: ${m.headings.join(' | ')}`, `disclosures open: ${axeOpen}`, ...extra];
  if (problems.length && !baseline) throw new Error(`${view.name} ${w}: ${problems.join('; ')}`);
  return { notes: problems.length ? [...notes, `over caps (baseline run): ${problems.join('; ')}`] : notes };
}

/** Every feature reachable by Tab, Enter and Space only, opening at most one disclosure (AC 5). */
type Item = { name: string; sel: string; path?: string; via?: string };
const SAMPLE_IDS = ['git-scm', 'wikipedia-internet-archive', 'rust-lang'];
const wiki = '/?sample=wikipedia-internet-archive';
const INVENTORY: Item[] = [
  { name: 'URL input', sel: '#url-input' },
  { name: 'Show changes', sel: '.btn-go' },
  ...SAMPLE_IDS.map((id) => ({ name: `sample ${id}`, sel: `.chip[data-sample="${id}"]` })),
  { name: 'Compare picker', sel: '.vp-compare' },
  { name: 'compare modes (radio group)', sel: 'input[name="vp-mode"]', via: '.vp-compare' },
  { name: 'Play', sel: '.vp-play' },
  { name: 'Before / After (roving radio group)', sel: '.vp-sides[role="radiogroup"] .vp-side[role="radio"]', path: '/?view=single' },
  { name: 'slider handle', sel: '.vp-split' },
  { name: 'onion range', sel: '.vp-onion input[type="range"]', path: '/?view=onion' },
  { name: 'Swap', sel: '.vp-onion button', path: '/?view=onion' },
  { name: 'Previous', sel: '.diff-nav .btn:first-child' },
  { name: 'Next', sel: '.diff-nav .btn:last-child' },
  { name: 'Copy link', sel: '.change-details button', via: '.change-details > summary' },
  { name: 'View capture (Before)', sel: '.change-details a.cap-out:first-of-type', via: '.change-details > summary' },
  { name: 'View capture (After)', sel: '.change-details a.cap-out:nth-of-type(2)', via: '.change-details > summary' },
  { name: 'Open capture', sel: '.vpane .cap-out', path: '/?view=single' },
  { name: 'filmstrip', sel: '.frame' },
  { name: 'timeline slider', sel: '.tl-slider' },
  { name: 'Show trivial edits', sel: '.tl-key input[type="checkbox"]', via: '.tl-key > summary' },
  { name: 'timeline key items', sel: '#timeline-legend', via: '.tl-key > summary' },
  { name: 'changes list items', sel: '.change', via: '.changes-pane > summary' },
  { name: 'Structure', sel: '.diff-panel details:first-of-type > summary' },
  { name: 'Diff key', sel: '.diff-panel details:last-of-type > summary' },
  { name: 'Show unchanged blocks', sel: '.db-gap', path: wiki },
  { name: 'Skip to diff', sel: '.skip-link[href="#diff"]' },
  { name: 'About these captures', sel: '.site-footer details:first-of-type > summary' },
  { name: 'Keyboard shortcuts', sel: '.site-footer details:last-of-type > summary' },
  { name: 'GitHub link', sel: '.site-footer a[href*="github.com"]' },
];

/** Tabs from the top until `item` has focus (or, for text, is shown), pressing Enter on its one disclosure on the way. */
async function reach(page: Page, baseUrl: string, item: Item): Promise<string> {
  await openReady(page, baseUrl, item.path ?? '/');
  const text = item.sel === '#timeline-legend';
  let opened = '';
  for (let k = 1; k <= 160; k++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(({ sel, via }) => {
      const a = document.activeElement;
      return { hit: !!a?.matches(sel), via: !!via && !!a?.matches(via) };
    }, item);
    if (at.via && !opened) {
      // Enter for a <summary>, Space for the compare button: both native activations.
      opened = item.via!.includes('summary') ? 'Enter' : 'Space';
      await page.keyboard.press(opened);
      if (text) break;
      continue;
    }
    if (at.hit) {
      const tree = await page.locator(':focus').ariaSnapshot();
      // A named role (`button "Copy link"`), or a <summary>, which the snapshot lists by its text.
      if (!/"[^"]+"|^- text: \S/m.test(tree)) throw new Error(`${item.name}: focused but unnamed (${tree})`);
      return `${item.name}: Tab x${k}${opened ? ` after ${opened} on its disclosure` : ''}; ${tree.split('\n')[0]!.trim().slice(0, 60)}`;
    }
  }
  if (text) {
    const shown = await page.locator(item.sel).evaluate((el) => el.checkVisibility() && !!el.textContent?.trim());
    const tree = await page.locator(item.sel).ariaSnapshot();
    if (shown && tree.trim()) return `${item.name}: shown after ${opened} on its disclosure; ${tree.split('\n')[0]!.trim().slice(0, 60)}`;
  }
  throw new Error(`${item.name} (${item.sel}) not reached by keyboard`);
}

async function inventory({ page, baseUrl }: FlowContext) {
  const notes: string[] = [];
  for (const item of INVENTORY) notes.push(await reach(page, baseUrl, item));
  // The four modes are named radios in the opened group.
  await openReady(page, baseUrl);
  await openDisclosure(page, 'Compare');
  const modes = await page.locator('#vp-modes').getByRole('radio').evaluateAll((rs) => rs.map((r) => r.closest('label')?.textContent?.trim()));
  if (modes.join() !== 'Single,Side by side,Slider,Onion skin') throw new Error(`compare modes: ${modes.join()}`);
  notes.push(`compare modes: ${modes.join(', ')}`);
  // Escape inside the open picker closes it and returns focus to its button.
  await page.locator('#vp-modes input:checked').focus();
  await page.keyboard.press('Escape');
  const shut = await page.evaluate(() => ({ hidden: document.getElementById('vp-modes')!.hidden, focus: document.activeElement?.matches('.vp-compare[aria-expanded="false"]') }));
  if (!shut.hidden || !shut.focus) throw new Error(`Escape in the compare picker: ${JSON.stringify(shut)}`);
  notes.push('Escape closes the compare picker, focus on its button');
  // Before / After: a radio group; arrow keys (wrapping), Home and End move focus and select.
  await openReady(page, baseUrl, '/?view=single');
  const group = page.getByRole('radiogroup', { name: "Show the change's capture" });
  await group.locator('[aria-checked="true"]').focus();
  const steps: string[] = [];
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowDown', 'Home', 'End', 'ArrowUp']) {
    await page.keyboard.press(key);
    const at = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      const checked = [...document.querySelectorAll('.vp-side[aria-checked="true"]')];
      return { word: a?.textContent?.includes('Before') ? 'Before' : 'After', ok: checked.length === 1 && checked[0] === a && a?.tabIndex === 0 };
    });
    if (!at.ok) throw new Error(`Before / After ${key}: focus and selection apart`);
    steps.push(`${key}→${at.word}`);
  }
  if (steps.join() !== 'ArrowLeft→Before,ArrowLeft→After,ArrowDown→Before,Home→Before,End→After,ArrowUp→Before') throw new Error(`Before / After keys: ${steps.join()}`);
  notes.push(`Before / After radios: ${steps.join(' ')}`);
  return { notes };
}

/** Phones: the sticky Previous / Next bar is not stuck on first view and never covers the pane's caption (AC 9d). */
async function sticky(page: Page, scroll: boolean) {
  await settled(page);
  const m = () =>
    page.evaluate(() => {
      const nav = document.querySelector('.diff-nav')!;
      const cap = document.querySelector('.vpane .vp-cap')!.getBoundingClientRect();
      const bar = nav.getBoundingClientRect();
      return { stuck: nav.hasAttribute('data-stuck'), fixed: getComputedStyle(nav).position === 'fixed', bar: [bar.top, bar.bottom], cap: [cap.top, cap.bottom], meets: cap.top < bar.bottom && bar.top < cap.bottom, vh: innerHeight };
    });
  const first = await m();
  if (first.stuck || first.fixed || first.meets) throw new Error(`first view: ${JSON.stringify(first)}`);
  const notes = [`first view: bar in flow at ${first.bar.map(Math.round).join('-')}, caption ${first.cap.map(Math.round).join('-')}`];
  if (!scroll) return notes;
  await page.evaluate(() => document.getElementById('diff')!.scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => document.querySelector('.diff-nav[data-stuck]'), null, { timeout: 3_000 });
  const later = await m();
  if (!later.fixed || Math.round(later.bar[1]!) !== later.vh || later.meets) throw new Error(`scrolled: ${JSON.stringify(later)}`);
  return [...notes, `scrolled to the diff: bar fixed at ${later.bar.map(Math.round).join('-')}, caption ${later.cap.map(Math.round).join('-')} (clear)`];
}

/** Opens "Change details" with the keyboard: its summary (and the rows above it) stay put, the panel opens downward. */
async function detailsStay(page: Page): Promise<string> {
  const summary = page.locator('.change-details > summary');
  const top = () => summary.evaluate((el) => el.getBoundingClientRect().top + scrollY);
  const prev = () => page.locator('.diff-nav .btn').first().evaluate((el) => el.getBoundingClientRect().top + scrollY);
  // The view settles in (a short translate) after load: measure once it has finished.
  await settled(page);
  const before = [await top(), await prev()];
  await summary.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector<HTMLDetailsElement>('.change-details')?.open);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const after = [await top(), await prev()];
  const moved = after.map((a, i) => Math.round(Math.abs(a - before[i]!)));
  if (moved.some((d) => d > 2)) throw new Error(`opening Change details moved its summary by ${moved[0]} px and Previous by ${moved[1]} px (${before.map(Math.round)} → ${after.map(Math.round)})`);
  const panel = await page.evaluate(() => {
    const d = document.querySelector('.change-details')!.getBoundingClientRect();
    return { bottom: Math.round(d.bottom + scrollY), picture: Math.round(document.querySelector('.vpane .vp-mat')!.getBoundingClientRect().bottom + scrollY) };
  });
  await page.keyboard.press('Enter');
  return `Change details opened: summary moved ${moved[0]} px, Previous ${moved[1]} px; panel ends at ${panel.bottom} (picture ${panel.picture})`;
}

const live = (page: Page, baseUrl: string) => VIEWS.find((v) => v.name === 'live-done')!.setup(page, baseUrl);
const SOURCES = { rule: 'Summaries: auto summary (rules)', ai: 'Summaries: AI summary (Workers AI)', some: 'Summaries: mixed: items marked AI are by Workers AI' } as const;

export const calmFlows: readonly Flow[] = [
  ...VIEWS.map(
    (view): Flow => ({
      name: `calm-audit:${view.name}`,
      description: `Calm layout caps on the first viewport of "${view.name}" (1440×900, 390×844), with a first-view shot`,
      shot: view.name,
      widthTag: true,
      firstView: true,
      viewports: ['wide', 'mobile'],
      apiErrors: view.name.startsWith('live-e'),
      ...(view.name === 'hero' && { schemes: ['light', 'dark'], cvd: true }),
      run: (ctx) => audit(view, ctx),
    }),
  ),
  { name: 'calm-inventory', description: 'Every feature reachable by Tab, Enter and Space, opening at most one disclosure, named in the tree', viewports: ['wide', 'mobile'], widthTag: true, firstView: true, run: inventory },
  {
    name: 'calm-fit',
    description: 'Every sample at 1280×800 and 1440×900 (and git-scm at 960×800): the controls row ends within 8 px of the picture; the scrub strip starts in the first viewport; opening Change details does not move its summary',
    viewports: ['desktop', 'wide'],
    widthTag: true,
    firstView: true,
    async run({ page, baseUrl }) {
      const notes: string[] = [];
      for (const id of SAMPLE_IDS) {
        await openReady(page, baseUrl, `/?sample=${id}`);
        const m = await page.evaluate(() => {
          const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          return { gap: Math.round(Math.abs(r('.controls').bottom - r('.vpane .vp-mat').bottom)), scrub: Math.round(r('.scrub').top), vh: innerHeight };
        });
        if (m.gap > 8 || m.scrub >= m.vh) throw new Error(`${id}: controls ${m.gap} px from the picture's bottom, scrub strip at ${m.scrub} of ${m.vh}`);
        notes.push(`${id}: controls ${m.gap} px from the picture's bottom; scrub strip at ${m.scrub} (< ${m.vh}); ${await detailsStay(page)}`);
      }
      const size = page.viewportSize()!;
      if (size.width === 1440) {
        await page.setViewportSize({ width: 960, height: 800 });
        await openReady(page, baseUrl);
        notes.push(`git-scm at 960: ${await detailsStay(page)}`);
        await page.setViewportSize(size);
      }
      return { notes };
    },
  },
  {
    name: 'calm-sticky',
    description: 'Phones, sample: Previous / Next is in flow on first view and sticks to the bottom only once the row scrolled away, never over the caption',
    shot: 'hero',
    suffix: '-sticky-scrolled',
    viewports: ['mobile'],
    widthTag: true,
    firstView: true,
    async run({ page, baseUrl }) {
      await openReady(page, baseUrl);
      return { notes: await sticky(page, true) };
    },
  },
  {
    name: 'calm-sticky-live',
    description: 'Phones, live run: on first view the bar is in flow and clear of the caption',
    shot: 'live',
    suffix: '-first-view',
    viewports: ['mobile'],
    widthTag: true,
    firstView: true,
    async run({ page, baseUrl }) {
      await live(page, baseUrl);
      await page.evaluate(() => scrollTo(0, 0));
      return { notes: await sticky(page, false) };
    },
  },
  {
    name: 'calm-tag-320',
    description: 'At 320 px the loading tag of a held live pane covers at most 10% of the text outline',
    viewports: ['mobile'],
    async run({ page, baseUrl }) {
      await page.setViewportSize({ width: 320, height: 640 });
      await VIEWS.find((v) => v.name === 'live-running')!.setup(page, baseUrl);
      const m = await page.evaluate(() => {
        const area = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return r.width * r.height; };
        return { share: area('.vpane .lf-tag') / area('.vpane .lf'), text: document.querySelector('.vpane .lf-tag')!.textContent };
      });
      if (m.share > 0.1) throw new Error(`the tag covers ${(m.share * 100).toFixed(1)}% of the outline`);
      return { notes: [`tag covers ${(m.share * 100).toFixed(1)}% of the outline; its full text stays in the DOM: "${m.text}"`] };
    },
  },
  {
    name: 'calm-status-focus',
    description: 'Live run: Cancel keeps focus when the status line moves into the side column with the first change, and Start again gets it after Cancel',
    viewports: ['mobile', 'wide'],
    widthTag: true,
    async run({ page, baseUrl }) {
      await mockApi(page, { snapshot: (i) => (i < 4 ? { delay: 900 } : { delay: null }) });
      await openLive(page, baseUrl, 'git-scm.com', 'snapshots');
      const cancel = page.locator('.live-status button', { hasText: 'Cancel' });
      await cancel.focus();
      const where = () => page.evaluate(() => {
        const a = document.activeElement;
        const side = a?.closest('.side');
        return `${side ? (side.querySelector('.live-wait') ? 'waiting side' : 'side') : a?.closest('.hero') ? 'hero' : 'elsewhere'}:${a?.tagName.toLowerCase()}:${a?.textContent?.trim().slice(0, 20)}`;
      });
      const first = await where();
      if (first !== 'waiting side:button:Cancel') throw new Error(`Cancel focused before the first change: focus on ${first}`);
      await page.locator('.side .change-panel').waitFor({ timeout: 10_000 });
      const moved = await where();
      if (moved !== 'side:button:Cancel') throw new Error(`after the first change arrived, focus on ${moved} (was ${first})`);
      await page.keyboard.press('Enter');
      await page.locator('[data-live="cancelled"]').waitFor();
      const stopped = await where();
      if (!stopped.endsWith(':button:Start again')) throw new Error(`after Cancel, focus on ${stopped}`);
      return { notes: [`Cancel focused at ${first}; the first change arrived: focus on ${moved}; Enter (Cancel): focus on ${stopped}`] };
    },
  },
  {
    name: 'calm-reduced',
    description: 'The hero under reduced motion (shot)',
    shot: 'hero',
    suffix: '-reduced',
    viewports: ['wide'],
    widthTag: true,
    firstView: true,
    async run({ page, baseUrl }) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openReady(page, baseUrl);
      return { notes: ['reduced motion'] };
    },
  },
  {
    name: 'calm-kbd-disclosure',
    description: 'Keyboard only: Tab to Change details, Enter, Tab: focus is on a folded item (shot)',
    shot: 'hero',
    suffix: '-kbd-disclosure',
    viewports: ['wide'],
    widthTag: true,
    firstView: true,
    async run({ page, baseUrl }) {
      return { notes: [await reach(page, baseUrl, INVENTORY.find((i) => i.name === 'View capture (Before)')!)] };
    },
  },
  ...(Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map(
    (v): Flow => ({
      name: `calm-source:${v}`,
      description: `The changes list says once where its summaries come from (${v}); the timeline tooltip says it per change`,
      viewports: ['desktop'],
      async run({ page, baseUrl }) {
        await mockApi(page, v === 'rule' ? {} : { summaries: v });
        await openLive(page, baseUrl, 'git-scm.com', 'done');
        await page.waitForFunction((want) => document.querySelector('.changes-note')?.textContent === want, SOURCES[v], { timeout: 10_000 });
        const marks = await page.locator('.changes .change-sum .source-label').count();
        if ((v === 'some') !== marks > 0) throw new Error(`${marks} items marked AI in a "${v}" list`);
        await page.locator('.tl-slider').focus();
        await page.keyboard.press('Home');
        const tip = (await page.locator('.tl-tip').textContent()) ?? '';
        if (!/AI summary|auto summary/.test(tip)) throw new Error(`tooltip "${tip}"`);
        return { notes: [SOURCES[v], `${marks} items marked AI`, `tooltip: ${tip.slice(0, 80)}`] };
      },
    }),
  ),
];
