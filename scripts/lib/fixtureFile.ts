import { writeFileSync } from 'node:fs';
import type { SampleFixture } from '../../src/core/types.ts';

/** Writes a fixture with one array item per line: small files with reviewable git diffs. */
export function writeFixture(file: string, fixture: SampleFixture): string {
  const fields = Object.entries(fixture).map(([k, v]) =>
    Array.isArray(v) ? `"${k}": [\n${v.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n]` : `"${k}": ${JSON.stringify(v)}`,
  );
  const json = `{\n${fields.join(',\n')}\n}\n`;
  writeFileSync(file, json);
  return json;
}
