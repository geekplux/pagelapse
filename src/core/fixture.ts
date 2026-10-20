import { ARCHIVE_IDS } from '../archive/archives.ts';
import { isValidTimestamp } from './timestamp.ts';
import {
  BLOCK_KINDS,
  type Block,
  type BlockKind,
  type FixtureBlock,
  type FixtureSnapshot,
  type FixtureSummary,
  type HeadingLevel,
  type SampleFixture,
  type SnapshotPage,
} from './types.ts';

/** Thrown by {@link parseSampleFixture}; `path` points at the offending field. */
export class FixtureError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'FixtureError';
    this.path = path;
  }
}

const PAIR_KEY_RE = /^(\d{14})-(\d{14})$/;

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new FixtureError(path, 'expected an object');
  }
  return v as Obj;
}

function str(v: unknown, path: string, allowEmpty = false): string {
  if (typeof v !== 'string' || (!allowEmpty && v.trim() === '')) {
    throw new FixtureError(path, allowEmpty ? 'expected a string' : 'expected a non-empty string');
  }
  return v;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v) || v.length === 0) throw new FixtureError(path, 'expected a non-empty array');
  return v;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (typeof v !== 'string' || !options.includes(v as T)) {
    throw new FixtureError(path, `expected one of ${options.join(', ')}`);
  }
  return v as T;
}

function parseBlock(v: unknown, path: string): FixtureBlock {
  const o = obj(v, path);
  const block: FixtureBlock = { k: oneOf<BlockKind>(o.k, BLOCK_KINDS, `${path}.k`), t: str(o.t, `${path}.t`) };
  if (o.l !== undefined) {
    if (typeof o.l !== 'number' || !Number.isInteger(o.l) || o.l < 1 || o.l > 6) {
      throw new FixtureError(`${path}.l`, 'expected a heading level 1-6');
    }
    block.l = o.l as HeadingLevel;
  }
  return block;
}

function parseSnapshot(v: unknown, path: string, blockCount: number): FixtureSnapshot {
  const o = obj(v, path);
  const ts = str(o.ts, `${path}.ts`);
  if (!isValidTimestamp(ts)) throw new FixtureError(`${path}.ts`, 'expected a 14-digit UTC timestamp');
  const blockIds = arr(o.blockIds, `${path}.blockIds`).map((id, i) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= blockCount) {
      throw new FixtureError(`${path}.blockIds[${i}]`, `expected an integer in 0..${blockCount - 1}`);
    }
    return id;
  });
  const snap: FixtureSnapshot = {
    ts,
    digest: str(o.digest, `${path}.digest`),
    title: str(o.title, `${path}.title`, true),
    blockIds,
  };
  if (o.truncated !== undefined) {
    if (typeof o.truncated !== 'boolean') throw new FixtureError(`${path}.truncated`, 'expected a boolean');
    snap.truncated = o.truncated;
  }
  return snap;
}

function parseSummary(v: unknown, path: string): FixtureSummary {
  const o = obj(v, path);
  const summary: FixtureSummary = {
    text: str(o.text, `${path}.text`),
    source: oneOf(o.source, ['ai', 'rule'] as const, `${path}.source`),
  };
  if (o.model !== undefined) summary.model = str(o.model, `${path}.model`);
  return summary;
}

/**
 * Validates untrusted JSON as a {@link SampleFixture} (schema v1).
 * Checks types, block kinds, blockId ranges, timestamp format and strictly
 * chronological snapshots. Throws a {@link FixtureError} on the first problem.
 */
export function parseSampleFixture(json: unknown): SampleFixture {
  const o = obj(json, '$');
  if (o.schema !== 1) throw new FixtureError('$.schema', 'expected schema 1');
  const src = obj(o.source, '$.source');
  const blocks = arr(o.blocks, '$.blocks').map((b, i) => parseBlock(b, `$.blocks[${i}]`));
  const snapshots = arr(o.snapshots, '$.snapshots').map((s, i) =>
    parseSnapshot(s, `$.snapshots[${i}]`, blocks.length),
  );
  snapshots.forEach((s, i) => {
    const prev = snapshots[i - 1];
    if (prev && s.ts <= prev.ts) {
      throw new FixtureError(`$.snapshots[${i}].ts`, 'snapshots must be strictly chronological');
    }
  });
  const fixture: SampleFixture = {
    schema: 1,
    id: str(o.id, '$.id'),
    label: str(o.label, '$.label'),
    url: str(o.url, '$.url'),
    description: str(o.description, '$.description'),
    source: {
      archive: oneOf(src.archive, ARCHIVE_IDS, '$.source.archive'),
      recordedAt: str(src.recordedAt, '$.source.recordedAt'),
      recorder: str(src.recorder, '$.source.recorder'),
      license: str(src.license, '$.source.license'),
      attribution: str(src.attribution, '$.source.attribution'),
    },
    blocks,
    snapshots,
  };
  if (o.summaries !== undefined) {
    const sums = obj(o.summaries, '$.summaries');
    fixture.summaries = {};
    for (const [key, value] of Object.entries(sums)) {
      if (!PAIR_KEY_RE.test(key)) throw new FixtureError(`$.summaries["${key}"]`, 'expected "<fromTs>-<toTs>"');
      fixture.summaries[key] = parseSummary(value, `$.summaries["${key}"]`);
    }
  }
  return fixture;
}

/** Expands a fixture's interned blocks into one {@link SnapshotPage} per capture. */
export function fixtureToSnapshots(fixture: SampleFixture): SnapshotPage[] {
  const blocks: Block[] = fixture.blocks.map((b) =>
    b.l === undefined ? { kind: b.k, text: b.t } : { kind: b.k, text: b.t, level: b.l },
  );
  return fixture.snapshots.map((s) => {
    const page: SnapshotPage = {
      ts: s.ts,
      digest: s.digest,
      title: s.title,
      // blockIds were range-checked by parseSampleFixture.
      blocks: s.blockIds.map((id) => ({ ...(blocks[id] as Block) })),
    };
    if (s.truncated) page.truncated = true;
    return page;
  });
}
