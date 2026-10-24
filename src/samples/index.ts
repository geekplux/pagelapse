import { parseSampleFixture } from '../core/fixture.ts';
import type { SampleFixture } from '../core/types.ts';
import { retryableImport } from '../app/workspace.ts';
import { shotSrc } from '../app/visual/visualState.ts';
import config from './samples.config.json';

/** A built-in sample: its name and page (the hero's options, the address menu) plus a loader for its fixture. */
export interface SampleEntry {
  id: string;
  name: string;
  /** The recorded page, as in samples.config.json. */
  url: string;
  load: () => Promise<SampleFixture>;
  /** The fixture once `load` has resolved (a deep link loads it before the first render, main.tsx). */
  loaded: () => SampleFixture | undefined;
}

/** What the registry needs of a samples.config.json entry. */
export interface SampleConfig {
  id: string;
  label: string;
  url: string;
}

/** The recorded fixtures, as a build-time list of files: a config entry without one is never offered. */
const FIXTURES = import.meta.glob<{ default: unknown }>(['./*.json', '!./samples.config.json']);

/** The config entries that have a recorded fixture (`./<id>.json` in `fixtures`), in config order. */
export const recorded = <C extends SampleConfig>(entries: readonly C[], fixtures: Record<string, unknown>): C[] =>
  entries.filter((c) => `./${c.id}.json` in fixtures);

/** The short name an option shows: the label without " home page" (`git-scm.com`, `Wikipedia: Internet Archive`). */
export const sampleName = (label: string) => label.replace(/ home page$/, '');

/** Registry of the built-in samples that are recorded, in samples.config.json order; each loads lazily, once. */
export const samples: readonly SampleEntry[] = recorded(config, FIXTURES).map((c) => {
  const fixture = retryableImport(() => FIXTURES[`./${c.id}.json`]!().then((m) => parseSampleFixture(m.default)));
  return { id: c.id, name: sampleName(c.label), url: c.url, load: fixture.load, loaded: fixture.loaded };
});

/** The default sample: the first recorded one (Wikipedia: Internet Archive). An unknown `?sample=` opens it. */
export const defaultEntry: SampleEntry = samples[0]!;

/** The sample `id` names, or the default when it names none that is recorded (`?sample=nope`, an unrecorded entry). */
export const sampleFor = (id?: string): SampleEntry => samples.find((s) => s.id === id) ?? defaultEntry;

/** The sample the hero deals as its deck of captures (DESIGN.md: Wikipedia, also the default sample). */
export const DECK_SAMPLE = 'wikipedia-internet-archive';
/** Its pictured captures: the deck keeps their height while the sample loads (samples.test.ts keeps it true). */
export const DECK_CAPTURES = 14;

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
