import { parseSampleFixture } from '../core/fixture.ts';
import type { SampleFixture } from '../core/types.ts';
import { overviewPair, shotSrc } from '../app/visual/visualState.ts';
import gitScm from './git-scm.json';

/** A built-in sample: its name and page (the hero's options, the address menu) plus a loader for its fixture. */
export interface SampleEntry {
  id: string;
  name: string;
  /** The recorded page, as in samples.config.json. */
  url: string;
  load: () => Promise<SampleFixture>;
}

/** The sample shown on first load (git-scm.com, for its clearly visible 2025 redesign; D23); statically bundled so it renders offline, instantly. */
export const defaultSample: SampleFixture = parseSampleFixture(gitScm);

const lazy = (load: () => Promise<{ default: unknown }>) => () => load().then((m) => parseSampleFixture(m.default));

/** Registry of built-in samples (ids match samples.config.json); non-default ones load lazily. */
export const samples: readonly SampleEntry[] = [
  { id: defaultSample.id, name: 'git-scm.com', url: defaultSample.url, load: () => Promise.resolve(defaultSample) },
  { id: 'wikipedia-internet-archive', name: 'Wikipedia: Internet Archive', url: 'https://en.wikipedia.org/wiki/Internet_Archive', load: lazy(() => import('./wikipedia-internet-archive.json')) },
  { id: 'rust-lang', name: 'rust-lang.org', url: 'https://www.rust-lang.org/', load: lazy(() => import('./rust-lang.json')) },
];

/** The sample the hero deals as its deck of captures (DESIGN.md: Wikipedia, whatever the default sample is). */
export const DECK_SAMPLE = 'wikipedia-internet-archive';

/** A page address as the field shows it: no scheme, no trailing slash (`en.wikipedia.org/wiki/Internet_Archive`). */
export const displayAddress = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** The host the address menu shows beside a sample's name, without `www.`. */
export const hostOf = (url: string) => displayAddress(url).split('/')[0]!.replace(/^www\./, '');

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

/** The default sample's first view: its decade compare (first complete capture ↔ latest), as a `<from>-<to>` pair. */
const hero = overviewPair(defaultSample.snapshots);
const heroPair = hero ? `${hero.from}-${hero.to}` : defaultSample.featured;

// The hero pictures start loading before React's first render (D23).
if (typeof Image === 'function') for (const src of changePictures(defaultSample, heroPair)) void decodePicture(src);
