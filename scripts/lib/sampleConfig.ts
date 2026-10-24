// The sample config (src/samples/samples.config.json) for the scripts: which entries are recorded, and `--only`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Every entry of samples.config.json, in order (the first recorded one is the app's default sample). */
export const readSampleConfig = <T extends { id: string }>(root: string): T[] =>
  JSON.parse(readFileSync(join(root, 'src/samples/samples.config.json'), 'utf8')) as T[];

/** Whether sample `id` has a committed fixture (the app offers only these, src/samples/index.ts). */
export const isRecorded = (root: string, id: string) => existsSync(join(root, 'src/samples', `${id}.json`));

/** The recorded entries, in config order. */
export const recordedSamples = <T extends { id: string }>(root: string): T[] => readSampleConfig<T>(root).filter((c) => isRecorded(root, c.id));

/** The entries `--only a,b` names (all of them without it), in config order; an unknown id is an error. */
export function pickSamples<T extends { id: string }>(configs: readonly T[], only?: string): T[] {
  const ids = only?.split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids?.length) return [...configs];
  const unknown = ids.filter((id) => !configs.some((c) => c.id === id));
  if (unknown.length) throw new Error(`no sample with id ${unknown.map((id) => `"${id}"`).join(', ')} in samples.config.json`);
  return configs.filter((c) => ids.includes(c.id));
}
