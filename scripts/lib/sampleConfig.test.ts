import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isRecorded, pickSamples, readSampleConfig, recordedSamples } from './sampleConfig.ts';

const configs = [{ id: 'wiki' }, { id: 'nasa' }, { id: 'creative-commons' }, { id: 'git' }];

describe('pickSamples', () => {
  it('takes every entry without --only, in config order', () => {
    expect(pickSamples(configs).map((c) => c.id)).toEqual(['wiki', 'nasa', 'creative-commons', 'git']);
    expect(pickSamples(configs, '').map((c) => c.id)).toEqual(['wiki', 'nasa', 'creative-commons', 'git']);
  });

  it('takes one id or a comma-separated list, in config order, ignoring spaces and empty items', () => {
    expect(pickSamples(configs, 'git').map((c) => c.id)).toEqual(['git']);
    expect(pickSamples(configs, 'creative-commons, nasa,').map((c) => c.id)).toEqual(['nasa', 'creative-commons']);
  });

  it('fails on an unknown id, naming every one', () => {
    expect(() => pickSamples(configs, 'nasa,bogus,nope')).toThrow('no sample with id "bogus", "nope" in samples.config.json');
  });
});

describe('recordedSamples', () => {
  const root = mkdtempSync(join(tmpdir(), 'pagelapse-samples-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src/samples'), { recursive: true });
  writeFileSync(join(root, 'src/samples/samples.config.json'), JSON.stringify(configs));
  for (const id of ['git', 'wiki']) writeFileSync(join(root, `src/samples/${id}.json`), '{}');

  it('keeps the entries with a fixture file, in config order', () => {
    expect(readSampleConfig(root).map((c) => c.id)).toEqual(['wiki', 'nasa', 'creative-commons', 'git']);
    expect(recordedSamples(root).map((c) => c.id)).toEqual(['wiki', 'git']);
    expect([isRecorded(root, 'wiki'), isRecorded(root, 'nasa')]).toEqual([true, false]);
  });

  it('reads the real config: Wikipedia first, NASA and Creative Commons waiting until recorded', () => {
    const repo = resolve(import.meta.dirname, '../..');
    const ids = recordedSamples(repo).map((c) => c.id);
    expect(ids[0]).toBe('wikipedia-internet-archive');
    for (const id of ['nasa', 'creative-commons']) expect(ids.includes(id)).toBe(isRecorded(repo, id));
  });
});
