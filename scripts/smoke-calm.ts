// Calm-layout smoke flows (docs/DESIGN.md, "Calm layout caps"). `calm-audit:<view>` measures the first
// viewport of each audited view at 1440×900 and 390×844 against the caps and saves a first-view shot of it (the
// "calm shots"). Set CALM_BASELINE=1 to report without failing (the before/after baseline run).
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright-core';
import { recordedSamples } from './lib/sampleConfig.ts';
import { mockFromSample } from '../test/fixtures/api/live.ts';
import { assertAxeClean } from './smoke-a11y.ts';
import { type Flow, type FlowContext, openReady } from './smoke-flows.ts';
import { framesPainted, mockApi, openLive } from './smoke-live.ts';

const baseline = !!process.env.CALM_BASELINE;
/** First-load caps per width: regions, tab stops, framed boxes, eyebrow labels, solid accent fills (docs/DESIGN.md). */
const CAPS = { wide: [3, 13, 2, 2, 1], mobile: [3, 12, 2, 1, 1] } as const;
const HEROES = new Set(['hero', 'hero-nasa', 'single', 'live-done']);

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
    // Controls and pictures are not boxes around content: the segmented controls' sand-3 track included.
    // The diff's added/removed tint bands are marks, not boxes (target/V3Work.html).
    if (!seen(el) || el.closest('input, button, select, textarea, summary, .btn, .vp-mat, .rb-strip, .vp-modes, .vp-sides, .diff-body .db-run')) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'inline' || r.width < 48 || r.height < 24) return false;
    const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).filter((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none').length;
    return sides >= 3 || cs.boxShadow !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== paper);
  });
  const eyebrow = (el: Element | null) => !!el && /uppercase/.test(getComputedStyle(el).textTransform) && /monospace/.test(getComputedStyle(el).fontFamily);
  const eyebrows = els.filter((el) => seen(el) && eyebrow(el) && !!el.textContent?.trim() && !eyebrow(el.parentElement));
  const probe = document.createElement('i');
  probe.style.color = 'var(--sand-12)';
  document.body.append(probe);
  const ink = getComputedStyle(probe).color;
  probe.remove();
  const fills = els.filter((el) => seen(el) && getComputedStyle(el).backgroundColor === ink && el.getBoundingClientRect().width >= 16 && el.getBoundingClientRect().height >= 16);
  const mat = document.querySelector('.vpane .vp-mat');
  const m = mat?.getBoundingClientRect();
  const controls = document.querySelector('.controls') ?? document.querySelector('.diff-nav');
  const order = [document.querySelector('.sheet h2'), mat, controls, document.querySelector('.change-section')];
  const inOrder = order.every(Boolean) && order.every((el, i) => i === 0 || !!(order[i - 1]!.compareDocumentPosition(el!) & Node.DOCUMENT_POSITION_FOLLOWING));
  const status = document.querySelector('.live-status:not([aria-hidden="true"])');
  const frames = [...document.querySelectorAll('.rb-strip .rb-th')].map((f) => f.getBoundingClientRect()).filter((r) => r.right > 0 && r.left < vw);
  // Every change's rows: left edge and top, in DOM order.
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
    // From the stage block (the picture and, in Single, its caption) to the controls row.
    align: m && controls && Math.round(controls.getBoundingClientRect().top - document.querySelector('.vpane')!.getBoundingClientRect().bottom),
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
  // `hero` is the default sample (Wikipedia); this one keeps a second sample in the audit.
  { name: 'hero-nasa', setup: sample('/?sample=nasa') },
  { name: 'compare-side', setup: sample('/?view=side') },
  { name: 'single', setup: sample('/?view=single') },
  {
    name: 'text-diff',
    async setup(page, baseUrl) {
      await sample('/')(page, baseUrl);
      await page.evaluate(() => scrollTo(0, document.getElementById('diff')!.getBoundingClientRect().top + scrollY - 16));
    },
  },
  {
    name: 'live-running',
    async setup(page, baseUrl) {
      await mockApi(page, { snapshot: (i) => (i < 6 ? {} : { delay: null }) });
      await openLive(page, baseUrl, 'creativecommons.org', 'snapshots');
      await page.waitForFunction(() => document.querySelector('.live-status .live-count')?.textContent === '6 of 14', null, { timeout: 10_000 });
    },
  },
  {
    name: 'live-done',
    async setup(page, baseUrl) {
      await mockApi(page);
      await openLive(page, baseUrl, 'creativecommons.org', 'done');
      await framesPainted(page, '.vpane');
    },
  },
  {
    name: 'live-empty',
    async setup(page, baseUrl) {
      await mockApi(page, { captures: 'no_captures' });
      await openLive(page, baseUrl, 'creativecommons.org', 'error');
    },
  },
  {
    name: 'live-no-meaningful',
    async setup(page, baseUrl) {
      await mockApi(page, { data: () => mockFromSample('creative-commons', { same: true }) });
      await openLive(page, baseUrl, 'creativecommons.org', 'done');
    },
  },
  {
    name: 'live-error-ratelimited',
    async setup(page, baseUrl) {
      await mockApi(page, { captures: 'archive_rate_limited' });
      await openLive(page, baseUrl, 'creativecommons.org', 'error');
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
  const row = `calm-audit ${view.name} ${w}: regions ${m.regions ? `${m.regions.length} (${m.regions.join(',')})` : 'n/a'} · tab stops ${counts[1]} · framed ${counts[2]} · eyebrows ${counts[3]} · accent fills ${counts[4]}${m.picture ? ` · picture ${m.picture.width} px (${m.picture.share}%) top ${m.picture.top}` : ''}${m.align !== undefined && m.align !== null ? ` · controls ${m.align} px under the picture` : ''}`;
  console.error(row);
  const caps = CAPS[wide ? 'wide' : 'mobile'];
  const labels = ['regions', 'tab stops', 'framed boxes', 'eyebrow labels', 'accent fills'];
  const problems = counts.flatMap((n, i) => (n > caps[i]! || Number.isNaN(n) ? [`${labels[i]} ${Number.isNaN(n) ? 'n/a' : n} > ${caps[i]}`] : []));
  if (HEROES.has(view.name) && m.picture) {
    // target/V3Work.html: the stage spans the column, 40 + 48 + 4 + 20 + 24 px under the header (phones: 28 and a
    // two-line title); a live run's status takes the meta line's place.
    if (wide ? m.picture.width < 0.58 * w || m.picture.top > 250 : m.picture.width < w - 32 || m.picture.top > 400) problems.push(`picture ${m.picture.width} px wide at top ${m.picture.top}`);
    if (!m.inOrder) problems.push('hero DOM order is not title → picture → controls → change section');
    if (m.align !== 16) problems.push(`controls row starts ${m.align} px under the picture, expected 16`);
  }
  // A running run shows its progress line (counter, bar, Cancel) in the first viewport. The strip follows the
  // 1200 x 750 stage, below the fold at 1440 x 900 (target/V3Work.html, V1Live.html).
  if (view.name === 'live-running' && !m.status) problems.push('the status line is not in the first viewport');
  // Carry-over 9e: Every change is one column, one row under the other (tops strictly increase).
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

/** Every feature reachable by Tab, Enter and Space only, opening at most one disclosure. */
/** `wide`: a feature phones do not have (the ribbon's thumbnails, target/V3WorkPhone.html). */
type Item = { name: string; sel: string; path?: string; via?: string; wide?: boolean; open?: (page: Page, baseUrl: string) => Promise<unknown> };
/** Every offered sample (the recorded entries of samples.config.json), the default first. */
const SAMPLE_IDS = recordedSamples(fileURLToPath(new URL('..', import.meta.url))).map((c) => c.id);
/** Wikipedia's 2022 design change: its diff has unchanged runs to collapse (the decade compare, the default's first view, has few). */
const wiki = '/?sample=wikipedia-internet-archive&change=20220202204805-20230326224104';
const INVENTORY: Item[] = [
  // The samples are options of the address field's menu (a combobox): reached through the field, not by Tab.
  { name: 'Address field (samples menu)', sel: '#url-input[role="combobox"]' },
  { name: 'Show its history', sel: '.btn-go' },
  { name: 'Theme button (header)', sel: '.theme-btn' },
  { name: 'GitHub link (header)', sel: '.gh-link' },
  { name: 'compare modes (segmented radio group)', sel: 'input[name="vp-mode"]' },
  { name: 'Play', sel: '.vp-play' },
  { name: 'Before / After (roving radio group)', sel: '.vp-sides[role="radiogroup"] .vp-side[role="radio"]', path: '/?view=single' },
  { name: 'slider handle', sel: '.vp-split' },
  { name: 'Previous', sel: '.diff-nav .btn:first-child' },
  { name: 'Next', sel: '.diff-nav .btn:last-child' },
  { name: 'Copy link', sel: '.controls .vp-copy' },
  { name: 'View capture (Before)', sel: '.cs-links a:first-of-type' },
  { name: 'View capture (After)', sel: '.cs-links a:nth-of-type(2)' },
  { name: 'Open capture', sel: '.vpane .cap-out', path: '/?view=single' },
  { name: 'ribbon thumbnails', sel: '.rb-th', wide: true },
  { name: 'ribbon slider', sel: '.rb-slider' },
  // No built-in sample has a trivial edit: a live run of Creative Commons with two captures echoed a minute later.
  {
    name: 'Show them (trivial edits)',
    sel: '.changes-trivial button',
    async open(page, baseUrl) {
      await mockApi(page, { data: () => mockFromSample('creative-commons', { echo: [2, 6] }) });
      await openLive(page, baseUrl, 'creativecommons.org', 'done');
    },
  },
  { name: 'Every change rows', sel: '.changes .change' },
  { name: 'Show unchanged blocks', sel: '.db-gap', path: wiki },
  { name: 'Show more changes', sel: '.db-more .btn' },
  { name: 'Skip to diff', sel: '.skip-link[href="#diff"]' },
  { name: 'About these captures', sel: '.site-footer details:first-of-type > summary' },
  { name: 'Keyboard shortcuts', sel: '.site-footer details:last-of-type > summary' },
  { name: 'GitHub link', sel: '.site-footer a[href*="github.com"]' },
];

/** Tabs from the top until `item` has focus, pressing Enter on its one disclosure on the way. */
async function reach(page: Page, baseUrl: string, item: Item): Promise<string> {
  await (item.open ? item.open(page, baseUrl) : openReady(page, baseUrl, item.path ?? '/'));
  let opened = '';
  for (let k = 1; k <= 160; k++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(({ sel, via }) => {
      const a = document.activeElement;
      return { hit: !!a?.matches(sel), via: !!via && !!a?.matches(via) };
    }, { sel: item.sel, via: item.via });
    if (at.via && !opened) {
      // Enter for a <summary>, Space for a button: both native activations.
      opened = item.via!.includes('summary') ? 'Enter' : 'Space';
      await page.keyboard.press(opened);
      continue;
    }
    if (at.hit) {
      const tree = await page.locator(':focus').ariaSnapshot();
      // A named role (`button "Copy link"`), or a <summary>, which the snapshot lists by its text.
      if (!/"[^"]+"|^- text: \S/m.test(tree)) throw new Error(`${item.name}: focused but unnamed (${tree})`);
      return `${item.name}: Tab x${k}${opened ? ` after ${opened} on its disclosure` : ''}; ${tree.split('\n')[0]!.trim().slice(0, 60)}`;
    }
  }
  throw new Error(`${item.name} (${item.sel}) not reached by keyboard`);
}

async function inventory({ page, baseUrl }: FlowContext) {
  const notes: string[] = [];
  const phone = page.viewportSize()!.width < 640;
  for (const item of INVENTORY) if (!(phone && item.wide)) notes.push(await reach(page, baseUrl, item));
  // The modes are named radios in the segmented control (phones offer Slider and Single).
  await openReady(page, baseUrl);
  const modes = await page.locator('#vp-modes').getByRole('radio').evaluateAll((rs) => rs.map((r) => r.closest('label')?.textContent?.trim()));
  const want = page.viewportSize()!.width < 640 ? 'Slider,Single' : 'Slider,Side by side,Single';
  if (modes.join() !== want) throw new Error(`compare modes: ${modes.join()}`);
  notes.push(`compare modes: ${modes.join(', ')}`);
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

/** Phones: the sticky Previous / Next bar is not stuck on first view and never covers the stage. */
async function sticky(page: Page, scroll: boolean) {
  await settled(page);
  const m = () =>
    page.evaluate(() => {
      const nav = document.querySelector('.diff-nav')!;
      const cap = document.querySelector('.vpane .vp-mat')!.getBoundingClientRect();
      const bar = nav.getBoundingClientRect();
      return { stuck: nav.hasAttribute('data-stuck'), fixed: getComputedStyle(nav).position === 'fixed', bar: [bar.top, bar.bottom], cap: [cap.top, cap.bottom], meets: cap.top < bar.bottom && bar.top < cap.bottom, vh: innerHeight };
    });
  const first = await m();
  if (first.stuck || first.fixed || first.meets) throw new Error(`first view: ${JSON.stringify(first)}`);
  const notes = [`first view: bar in flow at ${first.bar.map(Math.round).join('-')}, stage ${first.cap.map(Math.round).join('-')}`];
  if (!scroll) return notes;
  await page.evaluate(() => document.getElementById('diff')!.scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => document.querySelector('.diff-nav[data-stuck]'), null, { timeout: 3_000 });
  const later = await m();
  if (!later.fixed || Math.round(later.bar[1]!) !== later.vh || later.meets) throw new Error(`scrolled: ${JSON.stringify(later)}`);
  return [...notes, `scrolled to the diff: bar fixed at ${later.bar.map(Math.round).join('-')}, stage ${later.cap.map(Math.round).join('-')} (clear)`];
}

const live = (page: Page, baseUrl: string) => VIEWS.find((v) => v.name === 'live-done')!.setup(page, baseUrl);
/** Every change tags AI lines only in a list that mixes sources; the change section always names its own source. */
const SOURCES = { rule: 'Auto summary', ai: 'AI summary', some: /^(AI|Auto) summary$/ } as const;

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
    description: 'Every sample at 1280×800 and 1440×900 (and NASA at 960×800): the controls row starts 16 px under the picture',
    viewports: ['desktop', 'wide'],
    widthTag: true,
    firstView: true,
    async run({ page, baseUrl }) {
      const notes: string[] = [];
      for (const id of SAMPLE_IDS) {
        await openReady(page, baseUrl, `/?sample=${id}`);
        const m = await page.evaluate(() => {
          const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          return { gap: Math.round(r('.controls').top - r('.vpane').bottom) };
        });
        if (m.gap !== 16) throw new Error(`${id}: controls ${m.gap} px under the picture, expected 16`);
        notes.push(`${id}: controls ${m.gap} px under the picture`);
      }
      const size = page.viewportSize()!;
      if (size.width === 1440) {
        await page.setViewportSize({ width: 960, height: 800 });
        await openReady(page, baseUrl, '/?sample=nasa');
        const gap = await page.evaluate(() => Math.round(document.querySelector('.controls')!.getBoundingClientRect().top - document.querySelector('.vpane')!.getBoundingClientRect().bottom));
        if (gap !== 16) throw new Error(`nasa at 960: controls ${gap} px under the picture, expected 16`);
        notes.push(`nasa at 960: controls ${gap} px under the picture`);
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
    description: 'Live run: the status line stays under the title, so Cancel keeps focus when the first change arrives, and Start again gets it after Cancel',
    viewports: ['mobile', 'wide'],
    widthTag: true,
    async run({ page, baseUrl }) {
      await mockApi(page, { snapshot: (i) => (i < 4 ? { delay: 900 } : { delay: null }) });
      await openLive(page, baseUrl, 'creativecommons.org', 'snapshots');
      const cancel = page.locator('.live-status button', { hasText: 'Cancel' });
      await cancel.focus();
      const where = () => page.evaluate(() => {
        const a = document.activeElement;
        return `${a?.closest('.sheet-head') ? 'title block' : 'elsewhere'}:${a?.tagName.toLowerCase()}:${a?.textContent?.trim().slice(0, 20)}`;
      });
      const first = await where();
      if (first !== 'title block:button:Cancel') throw new Error(`Cancel focused before the first change: focus on ${first}`);
      await page.locator('.change-section #change-heading').waitFor({ timeout: 10_000 });
      const kept = await where();
      if (kept !== 'title block:button:Cancel') throw new Error(`after the first change arrived, focus on ${kept} (was ${first})`);
      await page.keyboard.press('Enter');
      await page.locator('[data-live="cancelled"]').waitFor();
      const stopped = await where();
      if (!stopped.endsWith(':button:Start again')) throw new Error(`after Cancel, focus on ${stopped}`);
      return { notes: [`Cancel focused at ${first}; the first change arrived: focus on ${kept}; Enter (Cancel): focus on ${stopped}`] };
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
    name: 'calm-kbd-archive-link',
    description: 'Keyboard only: Tab to the Before capture\'s archive link in the change section (shot)',
    shot: 'hero',
    suffix: '-kbd-archive-link',
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
      description: `Summary sources (${v}): the change section's tag, AI tags in Every change only when mixed; the ribbon tooltip says it per change`,
      viewports: ['desktop'],
      async run({ page, baseUrl }) {
        await mockApi(page, v === 'rule' ? {} : { summaries: v });
        await openLive(page, baseUrl, 'creativecommons.org', 'done');
        // AI lines arrive after the run: wait until the list shows what this source mix should.
        await page.waitForFunction(
          (want) => {
            const tags = document.querySelectorAll('.changes .change-sum .tag').length;
            const own = document.querySelector('.cs-side .tag')?.textContent ?? '';
            return want === 'some' ? tags > 0 : tags === 0 && own === (want === 'ai' ? 'AI summary' : 'Auto summary');
          },
          v,
          { timeout: 10_000 },
        );
        const marks = await page.locator('.changes .change-sum .tag').count();
        const own = (await page.locator('.cs-side .tag').textContent()) ?? '';
        const want = SOURCES[v];
        if ((v === 'some') !== marks > 0 || (typeof want === 'string' ? own !== want : !want.test(own))) throw new Error(`${marks} rows tagged AI, the change says "${own}" in a "${v}" list`);
        await page.locator('.rb-slider').focus();
        await page.keyboard.press('Home');
        const tip = (await page.locator('.rb-tip').textContent()) ?? '';
        if (!/AI summary|auto summary/.test(tip)) throw new Error(`tooltip "${tip}"`);
        return { notes: [`the change: ${own}`, `${marks} rows tagged AI`, `tooltip: ${tip.slice(0, 80)}`] };
      },
    }),
  ),
];
