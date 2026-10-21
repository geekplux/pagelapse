// Calm-layout smoke flows (phase 17, PLAN section 4 "Calm layout", D35). `calm-audit:<view>` measures the first
// viewport of each audited view at 1440×900 and 390×844 against the caps and saves a first-view shot of it (the
// "calm shots"). Set CALM_BASELINE=1 to report without failing (the before/after baseline run).
import type { Page } from 'playwright-core';
import { mockFromSample } from '../test/fixtures/api/live.ts';
import { assertAxeClean } from './smoke-a11y.ts';
import { type Flow, type FlowContext, openReady } from './smoke-flows.ts';
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
  return {
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

async function audit(view: View, { page, baseUrl, viewport }: FlowContext) {
  await view.setup(page, baseUrl);
  // Settle finite animations (the live dot pulses forever, so cap the wait).
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 1_500))]));
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
  // Axe with every disclosure open (the runner checks the closed state after this).
  const close = await openAll(page);
  const axeOpen = await assertAxeClean(page);
  await close();
  const notes = [row, `stops: ${m.stops.join(' ')}`, `framed: ${m.framed.join(' ')}`, `eyebrows: ${m.eyebrows.join(' ')}`, `fills: ${m.fills.join(' ')}`, `headings: ${m.headings.join(' | ')}`, `disclosures open: ${axeOpen}`];
  if (problems.length && !baseline) throw new Error(`${view.name} ${w}: ${problems.join('; ')}`);
  return { notes: problems.length ? [...notes, `over caps (baseline run): ${problems.join('; ')}`] : notes };
}

export const calmFlows: readonly Flow[] = VIEWS.map((view) => ({
  name: `calm-audit:${view.name}`,
  description: `Calm layout caps on the first viewport of "${view.name}" (1440×900, 390×844), with a first-view shot`,
  shot: view.name,
  widthTag: true,
  firstView: true,
  viewports: ['wide', 'mobile'],
  apiErrors: view.name.startsWith('live-e'),
  run: (ctx) => audit(view, ctx),
}));
