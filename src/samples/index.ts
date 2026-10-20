import { parseSampleFixture } from '../core/fixture.ts';
import type { SampleFixture } from '../core/types.ts';
import illustrativeDemo from './illustrative-demo.json';

/** A built-in sample: metadata for the picker plus a loader for its fixture. */
export interface SampleEntry {
  id: string;
  /** Short label for the sample chip. */
  chip: string;
  load: () => Promise<SampleFixture>;
}

/** The sample shown on first load; statically bundled so it renders offline, instantly. */
export const defaultSample: SampleFixture = parseSampleFixture(illustrativeDemo);

/** Registry of built-in samples. Non-default samples will be lazy `import()`s. */
export const samples: readonly SampleEntry[] = [
  { id: defaultSample.id, chip: 'Community garden (demo)', load: () => Promise.resolve(defaultSample) },
];
