// Sample picture budgets, shared by scripts/check-size.ts and the tests. Reads files only.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseSampleFixture } from '../../src/core/fixture.ts';
import { webpSize } from './webpInfo.ts';
import { recordedSamples } from './sampleConfig.ts';

/** The sample the hero deals as its deck (src/samples/index.ts DECK_SAMPLE). */
const DECK_SAMPLE = 'wikipedia-internet-archive';

/**
 * `total` was 2.2 MB for three samples; 4.6 MB since Pluto, World Wide Web and weather.gov joined (six samples use
 * about 4.0 MB). Only the first view is loaded up front, and its budget (`firstView`) is unchanged.
 */
export const PICTURE_BUDGET = { full: 64_000, thumb: 8_000, total: 4_600_000, firstView: 160_000 };
/**
 * Least share of captures with a picture. 90% until the 2026-10-25 sample set: Creative Commons has four captures
 * Arquivo.pt cannot replay and one picture dropped for its fundraising price, so 34 of the 39 captures are pictured.
 * With Pluto (two pictures dropped: a fundraising notice, an unstyled replay) and World Wide Web (one fundraising
 * notice dropped), 71 of the 79 captures are pictured.
 */
export const MIN_PICTURED = 0.85;

export interface PictureReport {
  count: number;
  largestFull: number;
  largestThumb: number;
  total: number;
  /** The hero deck: the deck sample's thumbnails behind the latest card, plus the latest capture full size. */
  firstView: number;
  /** Share of captures with a picture (`ok` or `partial`). */
  pictured: number;
  problems: string[];
}

/** Checks every recorded sample's pictures: present, right size, within budget, no orphans. */
export function checkPictures(root: string): PictureReport {
  const ids = recordedSamples(root).map((c) => c.id);
  const r: PictureReport = { count: 0, largestFull: 0, largestThumb: 0, total: 0, firstView: 0, pictured: 0, problems: [] };
  let captures = 0;
  for (const id of ids) {
    const f = parseSampleFixture(JSON.parse(readFileSync(join(root, 'src/samples', `${id}.json`), 'utf8')));
    const dir = join(root, 'public/samples', id);
    const seen = new Set<string>();
    const latest = f.snapshots.findLast((s) => s.shot?.file)?.ts;
    for (const s of f.snapshots) {
      captures++;
      if (!s.shot) r.problems.push(`${id} ${s.ts}: no shot`);
      if (!s.shot?.file) continue;
      r.pictured++;
      for (const [suffix, w, h, max, key] of [['.webp', 960, 600, PICTURE_BUDGET.full, 'largestFull'], ['.thumb.webp', 320, 200, PICTURE_BUDGET.thumb, 'largestThumb']] as const) {
        const name = `${s.shot.file}${suffix}`;
        seen.add(name);
        if (!existsSync(join(dir, name))) {
          r.problems.push(`${id}/${name} is missing`);
          continue;
        }
        const bytes = readFileSync(join(dir, name));
        const size = webpSize(bytes);
        if (size.w !== w || size.h !== h) r.problems.push(`${id}/${name} is ${size.w}×${size.h}, expected ${w}×${h}`);
        if (bytes.length > max) r.problems.push(`${id}/${name} is ${bytes.length} B, over ${max} B`);
        r[key] = Math.max(r[key], bytes.length);
        r.count++;
        r.total += bytes.length;
        if (id === DECK_SAMPLE && (suffix === '.webp') === (s.ts === latest)) r.firstView += bytes.length;
      }
    }
    for (const name of existsSync(dir) ? readdirSync(dir) : []) if (!seen.has(name)) r.problems.push(`${id}/${name} is an orphan`);
  }
  r.pictured /= captures || 1;
  if (r.total > PICTURE_BUDGET.total) r.problems.push(`pictures total ${r.total} B, over ${PICTURE_BUDGET.total} B`);
  if (r.firstView > PICTURE_BUDGET.firstView) r.problems.push(`first-view pictures ${r.firstView} B, over ${PICTURE_BUDGET.firstView} B`);
  if (r.pictured < MIN_PICTURED) r.problems.push(`only ${Math.round(r.pictured * 100)}% of captures have a picture (need >= ${MIN_PICTURED * 100}%)`);
  return r;
}
