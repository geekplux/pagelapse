// Flow registry for scripts/smoke.ts. Each flow runs once per viewport in a
// fresh browser context; the runner takes the screenshot after `run` resolves.
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { parseSampleFixture } from '../src/core/fixture.ts';
import { formatTimestampShort, timestampToIso } from '../src/core/timestamp.ts';

export interface FlowContext {
  page: Page;
  baseUrl: string;
  viewport: 'desktop' | 'mobile';
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
    description: 'First load renders the default sample with every capture date visible',
    async run({ page, baseUrl }) {
      const timeToReadyMs = await openReady(page, baseUrl);
      for (const s of defaultFixture.snapshots) {
        const time = page.locator(`time[datetime="${timestampToIso(s.ts)}"]`);
        await time.waitFor({ state: 'visible', timeout: 2_000 });
        const text = (await time.textContent())?.trim();
        if (text !== formatTimestampShort(s.ts)) {
          throw new Error(`capture ${s.ts}: expected "${formatTimestampShort(s.ts)}", got "${text}"`);
        }
      }
      return { timeToReadyMs, notes: [`${defaultFixture.snapshots.length} capture dates visible`] };
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
