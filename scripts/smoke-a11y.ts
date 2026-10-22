// Accessibility helpers for the smoke check: an axe-core pass and CVD-simulated screenshots.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright-core';
import { GRAY, MACHADO, type Matrix3 } from '../src/design/cvd.ts';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/** Runs axe-core on the page (not inside archived replay frames: they are not ours); throws on any serious or critical violation, returns a summary note. */
export async function assertAxeClean(page: Page): Promise<string> {
  // Evaluated over the DevTools protocol, not as an inline <script>, which the CSP (script-src 'self') blocks.
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const { axe } = window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } };
    const result = await axe.run(document, { resultTypes: ['violations'], iframes: false });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  });
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (bad.length) throw new Error(`axe: ${bad.map((v) => `${v.id} (${v.impact}, ${v.nodes} nodes)`).join('; ')}`);
  return `axe: 0 serious/critical${violations.length ? `; minor/moderate: ${violations.map((v) => v.id).join(', ')}` : ''}`;
}

export const CVD_VARIANTS = ['protan', 'deutan', 'tritan', 'gray'] as const;
export type CvdVariant = (typeof CVD_VARIANTS)[number];

/** Replaces the page-wide SVG feColorMatrix filter with one simulating `variant` in linear RGB. */
export async function setCvdFilter(page: Page, variant: CvdVariant): Promise<void> {
  const m: Matrix3 = variant === 'gray' ? GRAY : MACHADO[variant];
  const values = `${[0, 3, 6].map((i) => `${m.slice(i, i + 3).join(' ')} 0 0`).join(' ')} 0 0 0 1 0`;
  await page.evaluate((values) => {
    document.getElementById('wd-cvd')?.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'wd-cvd';
    // CSSOM, not a style attribute (the CSP blocks those).
    Object.assign(svg.style, { position: 'absolute', width: '0', height: '0' });
    svg.innerHTML = `<filter id="wd-cvd-f" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${values}"/></filter>`;
    document.body.append(svg);
    document.documentElement.style.filter = 'url(#wd-cvd-f)';
  }, values);
}
