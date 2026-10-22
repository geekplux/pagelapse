// Renders docs/hero.gif: the default sample's decade compare, then its time-lapse (one frame per Play step), captured
// at 1440×900 by the smoke runner's `hero-gif-frames` flow and turned into a looping GIF at 960×600 by ffmpeg
// (palettegen / paletteuse). Skips with a note when ffmpeg is missing. Needs `pnpm build` first; run it under the shared
// browser lock: `flock /workspace/gx-projects/logs/browser.lock pnpm render:gif --port 4199`.
//
// Usage: pnpm render:gif [--port 4173] [--frame docs/screenshots/phase-19/hero-gif-frame.webp]
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const frames = join(root, '.cache/hero-gif');
const OUT = join(root, 'docs/hero.gif');
const MAX_BYTES = 3_000_000;
/** Seconds per frame; the last frame (the latest capture) holds three times as long before the loop restarts. */
const STEP_S = 0.8;
/** The first frame, the decade compare, holds long enough to read both looks. */
const DECADE_S = 2.4;

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: { port: { type: 'string', default: '4173' }, frame: { type: 'string' } },
});

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).error) {
  console.log('render-hero-gif: skipped, ffmpeg is not installed. The README keeps the static hero (docs/hero.webp).');
  process.exit(0);
}

// The smoke runner owns the preview server and Chrome, and always tears both down.
const smoke = spawnSync(process.execPath, ['scripts/smoke.ts', '--flows', 'hero-gif-frames', '--port', values.port, '--out', '.cache/hero-gif-run'], {
  cwd: root,
  stdio: 'inherit',
});
if (smoke.status !== 0) {
  console.error('render-hero-gif: the frame capture failed');
  process.exit(1);
}
const pngs = readdirSync(frames).filter((f) => /^frame-\d+\.png$/.test(f)).sort();
if (pngs.length < 2) throw new Error(`render-hero-gif: only ${pngs.length} frames in ${frames}`);

// A concat list gives each frame its duration (the last one listed twice, as the format requires).
const list = [...pngs.map((f, i) => `file '${f}'\nduration ${i === 0 ? DECADE_S : i === pngs.length - 1 ? STEP_S * 3 : STEP_S}`), `file '${pngs.at(-1)}'`].join('\n');
writeFileSync(join(frames, 'frames.txt'), `${list}\n`);
for (const colors of [128, 64]) {
  const run = spawnSync(
    'ffmpeg',
    [
      '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
      '-vf', `scale=960:600:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop', '0', OUT,
    ],
    { cwd: frames, stdio: 'inherit' },
  );
  if (run.status !== 0) throw new Error(`render-hero-gif: ffmpeg exited with ${run.status}`);
  const bytes = statSync(OUT).size;
  console.log(`render-hero-gif: ${pngs.length} frames, ${colors} colours: docs/hero.gif ${bytes} B`);
  if (bytes <= MAX_BYTES) {
    if (values.frame) {
      // One frame of the GIF for review (the first Play step), as WebP.
      const conv = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(frames, pngs[1]!), '-vf', 'scale=960:600', '-quality', '80', resolve(root, values.frame)], { stdio: 'inherit' });
      if (conv.status !== 0) throw new Error('render-hero-gif: could not write the review frame');
    }
    process.exit(0);
  }
}
console.error(`render-hero-gif: docs/hero.gif is over ${MAX_BYTES} B even at 64 colours`);
process.exit(1);
