import { describe, expect, it } from 'vitest';
import { FixtureError, fixtureToSnapshots, parseSampleFixture } from './fixture.ts';
import { formatTimestampLong, formatTimestampShort, isValidTimestamp, timestampToIso } from './timestamp.ts';

/** Minimal valid fixture: two blocks, four captures. */
const demo = {
  schema: 1,
  id: 'tiny',
  label: 'Tiny page',
  url: 'https://example.org/',
  description: 'A minimal fixture for parser tests.',
  source: { archive: 'arquivo-pt', recordedAt: '2026-10-20', recorder: 'test', license: 'CC0-1.0', attribution: 'Test data.' },
  blocks: [
    { k: 'heading', t: 'Example', l: 1 },
    { k: 'paragraph', t: 'Hello.' },
  ],
  snapshots: ['20140317091200', '20160602143000', '20180101000000', '20200101000000'].map((ts, i) => ({
    ts,
    digest: `D${i}`,
    title: 'Example',
    blockIds: i % 2 ? [0, 1] : [0],
  })),
};

/** Deep-clones the minimal fixture so each test can break it freely. */
function clone(): Record<string, unknown> & { snapshots: Record<string, unknown>[] } {
  return structuredClone(demo) as never;
}

describe('parseSampleFixture', () => {
  it('accepts a minimal valid fixture', () => {
    const f = parseSampleFixture(demo);
    expect(f.id).toBe('tiny');
    expect(f.source.archive).toBe('arquivo-pt');
    expect(f.snapshots).toHaveLength(4);
  });

  it('accepts a valid summaries map', () => {
    const f = clone();
    f.summaries = { '20140317091200-20160602143000': { text: 'Added a workshops section', source: 'rule' } };
    expect(parseSampleFixture(f).summaries?.['20140317091200-20160602143000']?.source).toBe('rule');
  });

  const malformed: Array<[string, (f: ReturnType<typeof clone>) => void, string]> = [
    ['wrong schema', (f) => (f.schema = 2), '$.schema'],
    ['missing blocks', (f) => delete f.blocks, '$.blocks'],
    ['empty blocks', (f) => (f.blocks = []), '$.blocks'],
    ['unknown block kind', (f) => ((f.blocks as Record<string, unknown>[])[0]!.k = 'banner'), '$.blocks[0].k'],
    ['bad heading level', (f) => ((f.blocks as Record<string, unknown>[])[0]!.l = 7), '$.blocks[0].l'],
    ['out-of-range blockId', (f) => (f.snapshots[1]!.blockIds = [0, 999]), '$.snapshots[1].blockIds[1]'],
    ['negative blockId', (f) => (f.snapshots[0]!.blockIds = [-1]), '$.snapshots[0].blockIds[0]'],
    ['non-integer blockId', (f) => (f.snapshots[0]!.blockIds = [1.5]), '$.snapshots[0].blockIds[0]'],
    [
      'non-chronological timestamps',
      (f) => (f.snapshots[2]!.ts = '20150101000000'),
      '$.snapshots[2].ts',
    ],
    ['duplicate timestamps', (f) => (f.snapshots[1]!.ts = f.snapshots[0]!.ts), '$.snapshots[1].ts'],
    ['bad timestamp format', (f) => (f.snapshots[0]!.ts = '2014-03-17'), '$.snapshots[0].ts'],
    ['impossible timestamp date', (f) => (f.snapshots[0]!.ts = '20140231091200'), '$.snapshots[0].ts'],
    ['unknown archive', (f) => ((f.source as Record<string, unknown>).archive = 'illustrative'), '$.source.archive'],
    ['missing label', (f) => (f.label = ''), '$.label'],
    ['no snapshots', (f) => (f.snapshots = []), '$.snapshots'],
    ['bad summary key', (f) => (f.summaries = { nope: { text: 'x', source: 'rule' } }), '$.summaries["nope"]'],
    ['not an object', (f) => (f.source = null), '$.source'],
  ];

  it.each(malformed)('rejects %s', (_name, mutate, path) => {
    const f = clone();
    mutate(f);
    let error: unknown;
    try {
      parseSampleFixture(f);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FixtureError);
    expect((error as FixtureError).path).toBe(path);
  });

  it('rejects non-object input', () => {
    expect(() => parseSampleFixture('nope')).toThrow(FixtureError);
    expect(() => parseSampleFixture([])).toThrow(FixtureError);
  });
});

describe('fixtureToSnapshots', () => {
  it('un-interns blocks in order, one page per capture', () => {
    const f = parseSampleFixture(demo);
    const pages = fixtureToSnapshots(f);
    expect(pages.map((p) => p.ts)).toEqual(f.snapshots.map((s) => s.ts));
    expect(pages[1]!.blocks).toEqual([
      { kind: 'heading', text: 'Example', level: 1 },
      { kind: 'paragraph', text: 'Hello.' },
    ]);
    expect(pages[2]!.blocks).toHaveLength(1);
    // Blocks are copies, so callers cannot mutate shared fixture data.
    expect(pages[0]!.blocks[0]).not.toBe(pages[1]!.blocks[0]);
  });
});

describe('timestamps', () => {
  it('validates real 14-digit UTC timestamps only', () => {
    expect(isValidTimestamp('20140317091200')).toBe(true);
    expect(isValidTimestamp('20240229235959')).toBe(true);
    expect(isValidTimestamp('20230229000000')).toBe(false);
    expect(isValidTimestamp('20141317091200')).toBe(false);
    expect(isValidTimestamp('2014031709120')).toBe(false);
    expect(isValidTimestamp('20140317241200')).toBe(false);
  });

  it('formats for display and for <time datetime>', () => {
    expect(timestampToIso('20140317091200')).toBe('2014-03-17T09:12:00Z');
    expect(formatTimestampShort('20140317091200')).toBe('2014·03·17');
    expect(formatTimestampLong('20140317091200')).toBe('17 March 2014');
  });
});
