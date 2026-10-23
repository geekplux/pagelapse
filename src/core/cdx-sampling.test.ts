import { describe, expect, it } from 'vitest';
import { buildCdxUrl, dedupeAdjacentDigests, parseCdx, parseCdxJson, parseCdxNdjson } from './cdx.ts';
import { sampleCaptures } from './sampling.ts';
import type { Capture } from './types.ts';

describe('buildCdxUrl', () => {
  it.each([
    ['internet-archive', 'https://web.archive.org/cdx/search/cdx?'],
    ['arquivo-pt', 'https://arquivo.pt/wayback/cdx?'],
  ] as const)('%s: endpoint, both collapses, filters and fields', (archive, base) => {
    const url = buildCdxUrl(archive, 'https://example.org/a?b=1&c=2');
    expect(url.startsWith(base)).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('url')).toBe('https://example.org/a?b=1&c=2');
    expect(q.get('output')).toBe('json');
    expect(q.get('fl')).toBe('timestamp,digest,length');
    expect(q.getAll('filter')).toEqual(['statuscode:200', 'mimetype:text/html']);
    expect(q.getAll('collapse')).toEqual(['timestamp:6', 'digest']);
  });
});

describe('parsing', () => {
  const expected: Capture[] = [
    { ts: '20140317091200', digest: 'AAA', length: 5120 },
    { ts: '20160602143000', digest: 'BBB', length: 0 },
  ];

  it('parses IA array-of-arrays by header, skipping bad rows', () => {
    const body = JSON.stringify([
      ['digest', 'timestamp', 'length'],
      ['AAA', '20140317091200', '5120'],
      ['CCC', '2014', '1'],
      'junk',
      ['BBB', '20160602143000', '-'],
    ]);
    expect(parseCdxJson(body)).toEqual(expected);
    expect(parseCdx('internet-archive', body)).toEqual(expected);
    expect(parseCdxJson('')).toEqual([]);
    expect(parseCdxJson('[]')).toEqual([]);
  });

  it('parses pywb NDJSON, skipping blank and malformed lines', () => {
    const body = [
      '{"timestamp": "20140317091200", "digest": "AAA", "length": "5120", "status": "200"}',
      '',
      '{"timestamp": "20150101000000"}',
      'not json',
      '{"timestamp": "20160602143000", "digest": "BBB"}',
    ].join('\n');
    expect(parseCdxNdjson(body)).toEqual(expected);
    expect(parseCdx('arquivo-pt', body)).toEqual(expected);
  });

  it('drops only adjacent repeated digests', () => {
    const caps = ['A', 'A', 'B', 'A', 'A'].map((digest, i) => ({ ts: `2014010${i + 1}000000`, digest, length: 1 }));
    expect(dedupeAdjacentDigests(caps).map((c) => c.digest)).toEqual(['A', 'B', 'A']);
  });
});

describe('sampleCaptures', () => {
  // One capture a month for 10 years with a flat size, except a few big edits.
  const big = new Set([17, 63, 101]);
  const caps: Capture[] = Array.from({ length: 120 }, (_, i) => ({
    ts: `${2010 + Math.floor(i / 12)}${String((i % 12) + 1).padStart(2, '0')}15120000`,
    digest: `D${i}`,
    length: big.has(i) ? 6000 : 1000,
  }));

  it('keeps <= max, first and last, chronological and deterministic', () => {
    const s = sampleCaptures(caps, 16);
    expect(s).toHaveLength(16);
    expect(s[0]).toBe(caps[0]);
    expect(s.at(-1)).toBe(caps.at(-1));
    expect(s.map((c) => c.ts)).toEqual([...s.map((c) => c.ts)].sort());
    expect(sampleCaptures([...caps].reverse(), 16)).toEqual(s);
  });

  it('spreads across time buckets and prefers large size changes', () => {
    const s = sampleCaptures(caps, 16);
    const years = new Set(s.map((c) => c.ts.slice(0, 4)));
    expect(years.size).toBe(10);
    for (const i of big) expect(s).toContain(caps[i]);
  });

  it('fills slots of empty buckets with the largest remaining changes', () => {
    // Dense in the first year, then one capture at the end: buckets 2..13 are empty.
    const skewed = [...caps.slice(0, 12), caps[119]!];
    skewed[5] = { ...skewed[5]!, length: 9000 };
    const s = sampleCaptures(skewed, 6);
    expect(s).toHaveLength(6);
    expect(s).toContain(skewed[5]);
    expect(s).toContain(skewed[6]);
  });

  it('handles tiny inputs and limits', () => {
    expect(sampleCaptures(caps.slice(0, 3), 16)).toEqual(caps.slice(0, 3));
    expect(sampleCaptures(caps, 1)).toEqual([caps.at(-1)]);
    expect(sampleCaptures(caps, 0)).toEqual([]);
  });
});
