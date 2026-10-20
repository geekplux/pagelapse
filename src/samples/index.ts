import { parseSampleFixture } from '../core/fixture.ts';
import type { SampleFixture } from '../core/types.ts';
import wikipedia from './wikipedia-internet-archive.json';

/** A built-in sample: metadata for the picker plus a loader for its fixture. */
export interface SampleEntry {
  id: string;
  /** Short label for the sample chip. */
  chip: string;
  load: () => Promise<SampleFixture>;
}

/** The sample shown on first load; statically bundled so it renders offline, instantly. */
export const defaultSample: SampleFixture = parseSampleFixture(wikipedia);

const lazy = (load: () => Promise<{ default: unknown }>) => () => load().then((m) => parseSampleFixture(m.default));

/** Registry of built-in samples (ids match samples.config.json); non-default ones load lazily. */
export const samples: readonly SampleEntry[] = [
  { id: defaultSample.id, chip: 'Wikipedia: Internet Archive', load: () => Promise.resolve(defaultSample) },
  { id: 'git-scm', chip: 'git-scm.com', load: lazy(() => import('./git-scm.json')) },
  { id: 'rust-lang', chip: 'rust-lang.org', load: lazy(() => import('./rust-lang.json')) },
];
