import { parseSampleFixture } from '../core/fixture.ts';
import type { SampleFixture } from '../core/types.ts';
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
