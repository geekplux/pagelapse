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
  type SampleVisual,
  type ShotRef,
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
const SHOT_FILE_RE = /^\d{14}-[0-9a-f]{8}$/;

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
  if (o.shot !== undefined) snap.shot = parseShot(o.shot, `${path}.shot`, ts);
  return snap;
}

const count = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new FixtureError(path, 'expected a count >= 0');
  return v;
};

function parseShot(v: unknown, path: string, ts: string): ShotRef {
  const o = obj(v, path);
  const shot: ShotRef = {
    status: oneOf(o.status, ['ok', 'partial', 'failed'] as const, `${path}.status`),
    settle: oneOf(o.settle, ['quiet', 'cap'] as const, `${path}.settle`),
  };
  if (o.file !== undefined || shot.status !== 'failed') {
    const file = str(o.file, `${path}.file`);
    if (!SHOT_FILE_RE.test(file) || !file.startsWith(ts)) throw new FixtureError(`${path}.file`, 'expected "<ts>-<8 hex>"');
    shot.file = file;
  }
  if (o.missing !== undefined) {
    const m = obj(o.missing, `${path}.missing`);
    shot.missing = { css: count(m.css, `${path}.missing.css`), img: count(m.img, `${path}.missing.img`) };
  }
  if (o.redacted !== undefined) shot.redacted = count(o.redacted, `${path}.redacted`);
  if (o.reason !== undefined) shot.reason = str(o.reason, `${path}.reason`);
  return shot;
}

function size<W extends number, H extends number>(v: unknown, path: string, w: W, h: H): { w: W; h: H } {
  const o = obj(v, path);
  if (o.w !== w || o.h !== h) throw new FixtureError(path, `expected ${w}×${h}`);
  return { w, h };
}

function parseVisual(v: unknown, path: string): SampleVisual {
  const o = obj(v, path);
  const visual: SampleVisual = {
    archive: oneOf(o.archive, ARCHIVE_IDS, `${path}.archive`),
    recordedAt: str(o.recordedAt, `${path}.recordedAt`),
    recorder: str(o.recorder, `${path}.recorder`),
    viewport: size(o.viewport, `${path}.viewport`, 1280, 800),
    full: size(o.full, `${path}.full`, 960, 600),
    thumb: size(o.thumb, `${path}.thumb`, 320, 200),
    format: oneOf(o.format, ['webp'] as const, `${path}.format`),
    attribution: str(o.attribution, `${path}.attribution`),
  };
  if (o.notes !== undefined) visual.notes = arr(o.notes, `${path}.notes`).map((n, i) => str(n, `${path}.notes[${i}]`));
  return visual;
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
  if (o.featured !== undefined) {
    const [, from, to] = PAIR_KEY_RE.exec(str(o.featured, '$.featured')) ?? [];
    const has = (ts?: string) => snapshots.some((s) => s.ts === ts);
    if (!has(from) || !has(to) || from! >= to!) throw new FixtureError('$.featured', 'expected "<fromTs>-<toTs>" of two snapshots');
    fixture.featured = o.featured as string;
  }
  if (o.visual !== undefined) fixture.visual = parseVisual(o.visual, '$.visual');
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
