import { parseSampleFixture } from '../core/fixture.ts';
import type { SampleFixture } from '../core/types.ts';
import { shotSrc } from '../app/visual/visualState.ts';
import gitScm from './git-scm.json';

/** A built-in sample: metadata for the picker plus a loader for its fixture. */
export interface SampleEntry {
  id: string;
  /** Short label for the sample chip. */
  chip: string;
  load: () => Promise<SampleFixture>;
}

/** The sample shown on first load (git-scm.com, for its clearly visible 2025 redesign; D23); statically bundled so it renders offline, instantly. */
export const defaultSample: SampleFixture = parseSampleFixture(gitScm);

const lazy = (load: () => Promise<{ default: unknown }>) => () => load().then((m) => parseSampleFixture(m.default));

/** Registry of built-in samples (ids match samples.config.json); non-default ones load lazily. */
export const samples: readonly SampleEntry[] = [
  { id: defaultSample.id, chip: 'git-scm.com', load: () => Promise.resolve(defaultSample) },
  { id: 'wikipedia-internet-archive', chip: 'Wikipedia: Internet Archive', load: lazy(() => import('./wikipedia-internet-archive.json')) },
  { id: 'rust-lang', chip: 'rust-lang.org', load: lazy(() => import('./rust-lang.json')) },
];

const decoded = new Map<string, Promise<void>>();

/** Loads and decodes a picture once (later `<img>`s reuse it); resolves either way, the pane shows failures honestly. */
export function decodePicture(src: string): Promise<void> {
  let done = decoded.get(src);
  if (!done) {
    const img = new Image();
    img.fetchPriority = 'high';
    img.src = src;
    done = img.decode().catch(() => undefined);
    decoded.set(src, done);
  }
  return done;
}

/** Full-size pictures of a change's two captures (those that have one). */
export function changePictures(f: SampleFixture, pair?: string): string[] {
  return f.snapshots.flatMap((s) => (s.shot?.file && pair?.split('-').includes(s.ts) ? [shotSrc(f.id, s.shot.file)] : []));
}

// The hero pictures start loading before React's first render (D23).
if (typeof Image === 'function') for (const src of changePictures(defaultSample, defaultSample.featured)) void decodePicture(src);
