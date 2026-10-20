// Flow registry for scripts/smoke.ts. Each flow runs once per viewport in a
// fresh browser context; the runner takes the screenshot after `run` resolves.
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { parseSampleFixture } from '../src/core/fixture.ts';
import { formatTimestampLong, formatTimestampShort, timestampToIso } from '../src/core/timestamp.ts';
import { type Theme, palette } from '../src/design/palette.ts';

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
  /** Screenshot name suffix, e.g. `-kbd`. */
  suffix?: string;
  /** With `--cvd`, also capture protan/deutan/tritan/gray variants. */
  cvd?: boolean;
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

const defaultFixture = parseSampleFixture(
  JSON.parse(readFileSync(new URL('../src/samples/illustrative-demo.json', import.meta.url), 'utf8')),
);

export const flows: readonly Flow[] = [
  {
    name: 'sample-default',
    description: 'First load renders the default sample (dates, theme, self-hosted fonts)',
    schemes: ['light', 'dark'],
    cvd: true,
    async run({ page, baseUrl, scheme }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      for (const s of defaultFixture.snapshots) {
        const time = page.locator(`time[datetime="${timestampToIso(s.ts)}"]`);
        await time.waitFor({ state: 'visible', timeout: 2_000 });
        const shown = (await time.locator('[aria-hidden="true"]').textContent())?.trim();
        const spoken = (await time.locator('.sr-only').textContent())?.trim();
        if (shown !== formatTimestampShort(s.ts) || spoken !== formatTimestampLong(s.ts)) {
          throw new Error(`capture ${s.ts}: got "${shown}" / "${spoken}"`);
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
      return { timeToReadyMs, notes: [`${defaultFixture.snapshots.length} capture dates visible`, `${scheme} paper ${bg}`, `fonts: ${fonts.join(', ')}`] };
    },
  },
  {
    name: 'reduced-motion',
    description: 'Under prefers-reduced-motion: reduce, every transition and animation computes to 0s',
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
      for (let i = 0; i < 40; i++) {
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
      return { notes: [`${stops.length} stops: ${stops.map((s) => `${s.region}:${s.name}`).join(' | ')}`] };
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
