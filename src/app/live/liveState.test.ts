import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotPage } from '../../core/types.ts';
import { ApiError, fetchCaptures, fetchSnapshot } from './api.ts';
import { SUMMARY_EVERY, fetchOrder, initialLive, liveReducer, progressText, settledEntries, summariesDue } from './liveState.ts';
import { throttleLatest } from '../throttle.ts';

const caps = ['20140101000000', '20150101000000', '20160101000000'].map((ts) => ({ ts, digest: ts, length: 0 }));
const page = (ts: string, text: string): SnapshotPage => ({
  ts, digest: ts, title: 'Home',
  blocks: [{ kind: 'heading', text: 'Welcome', level: 1 }, { kind: 'paragraph', text }],
});
const started = () => liveReducer(initialLive('https://example.org/'), { type: 'captures', captures: caps });

describe('liveReducer', () => {
  it('rebuilds the timeline in time order from whatever has arrived: a capture between two others splits their change', () => {
    let s = started();
    expect(progressText(s)).toMatch(/^Fetching the first and latest of 3 captures, filling in the years between\. We fetch slowly/);
    s = liveReducer(s, { type: 'snapshot', index: 0, page: page(caps[0]!.ts, 'Old text.') });
    s = liveReducer(s, { type: 'snapshot', index: 2, page: page(caps[2]!.ts, 'A brand new paragraph about our tools and docs.') });
    expect(s.arrived).toBe(2);
    expect(s.timeline.entries.map((e) => `${e.from}-${e.to}`)).toEqual([`${caps[0]!.ts}-${caps[2]!.ts}`]);
    // Not settled: the capture between them may still split it.
    expect(settledEntries(s)).toEqual([]);
    expect(progressText(s)).toMatch(/^Fetched 2 of 3 captures, filling in the years between\. We fetch slowly/);
    const compared = s.compared.size;
    s = liveReducer(s, { type: 'snapshot', index: 1, page: page(caps[1]!.ts, 'A completely different paragraph about the archive and its history.') });
    expect(s.timeline.entries.map((e) => e.to)).toEqual([caps[1]!.ts, caps[2]!.ts]);
    // Two new pairs compared; the first and latest pair is not compared again.
    expect(s.compared.size).toBe(compared + 2);
    expect(s).toMatchObject({ status: 'done', arrived: 3, failed: [] });
    expect(settledEntries(s)).toHaveLength(2);
    expect(progressText(s)).toBe('Done: 3 captures, 2 meaningful changes.');
  });

  it('a failed capture settles the changes around it and is listed; a repeated answer is ignored', () => {
    let s = started();
    s = liveReducer(s, { type: 'snapshot', index: 0, page: page(caps[0]!.ts, 'Old text.') });
    s = liveReducer(s, { type: 'snapshot', index: 2, page: page(caps[2]!.ts, 'A brand new paragraph about our tools and docs.') });
    s = liveReducer(s, { type: 'snapshot', index: 1, page: null });
    expect(liveReducer(s, { type: 'snapshot', index: 1, page: null })).toBe(s);
    expect(s).toMatchObject({ status: 'done', arrived: 3, failed: [caps[1]!.ts] });
    expect(settledEntries(s)).toHaveLength(1);
    expect(progressText(s)).toBe('Done: 3 captures, 1 meaningful change. 1 capture could not be fetched.');
  });

  it('fetches first and latest first, then the middle of each gap, every capture once', () => {
    expect(fetchOrder(0)).toEqual([]);
    expect(fetchOrder(1)).toEqual([0]);
    expect(fetchOrder(2)).toEqual([0, 1]);
    expect(fetchOrder(5)).toEqual([0, 4, 2, 1, 3]);
    expect(fetchOrder(16).slice(0, 5)).toEqual([0, 15, 7, 3, 11]);
    for (const n of [3, 7, 16, 24]) expect([...fetchOrder(n)].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
  });

  it('stops on cancel and ignores late answers', () => {
    const s = liveReducer(started(), { type: 'cancel' });
    expect(progressText(s)).toBe('Stopped after 0 of 3 captures.');
    expect(liveReducer(s, { type: 'snapshot', index: 0, page: page(caps[0]!.ts, 'x') })).toBe(s);
    expect(progressText(liveReducer(initialLive('https://example.org/'), { type: 'cancel' }))).toBe('Stopped before the capture list arrived.');
  });

  it('keeps the error', () => {
    const error = new ApiError('excluded', 'Excluded.');
    expect(liveReducer(started(), { type: 'error', error })).toMatchObject({ status: 'error', error });
  });
});

describe('throttleLatest', () => {
  afterEach(() => vi.useRealTimers());
  it('emits the first value at once, then the latest at most once per interval', () => {
    vi.useFakeTimers();
    const out: string[] = [];
    const t = throttleLatest<string>(2000, (v) => out.push(v));
    t.push('a');
    t.push('b');
    t.push('c');
    expect(out).toEqual(['a']);
    vi.advanceTimersByTime(1999);
    expect(out).toEqual(['a']);
    vi.advanceTimersByTime(1);
    expect(out).toEqual(['a', 'c']);
    t.push('d');
    t.cancel();
    vi.advanceTimersByTime(5000);
    expect(out).toEqual(['a', 'c']);
    t.push('e');
    expect(out).toEqual(['a', 'c', 'e']);
  });
});

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number, body: unknown) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

  it('requests same-origin paths with the URL encoded and the default sample size', async () => {
    const fetch = answer(200, { url: 'https://example.org/', captures: [] });
    vi.stubGlobal('fetch', fetch);
    await fetchCaptures('https://example.org/?a=1', new AbortController().signal);
    await fetchSnapshot('https://example.org/', '20140101000000', new AbortController().signal);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      '/api/captures?url=https%3A%2F%2Fexample.org%2F%3Fa%3D1&max=16',
      '/api/snapshot?url=https%3A%2F%2Fexample.org%2F&ts=20140101000000',
    ]);
  });

  it('turns error answers into ApiError with the retry time', async () => {
    vi.stubGlobal('fetch', answer(503, { error: 'archive_rate_limited', message: 'Slow down.', retryAfter: 40 }));
    await expect(fetchCaptures('https://example.org/', new AbortController().signal)).rejects.toMatchObject({ code: 'archive_rate_limited', retryAfter: 40 });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('<html>', { status: 502 })));
    await expect(fetchCaptures('https://example.org/', new AbortController().signal)).rejects.toMatchObject({ code: 'archive_unavailable' });
  });

  it('reports an unreachable server as `network`, but an abort as the abort', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(fetchCaptures('https://example.org/', new AbortController().signal)).rejects.toMatchObject({ code: 'network' });
    const c = new AbortController();
    c.abort();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Promise.reject(new DOMException('Aborted', 'AbortError'))));
    await expect(fetchCaptures('https://example.org/', c.signal)).rejects.toBeInstanceOf(DOMException);
  });
});

describe('summariesDue', () => {
  it('waits for a batch mid-run, but asks for pending summaries once the run is done, cancelled or failed', () => {
    const mid = (n: number) => [summariesDue(n, 'captures'), summariesDue(n, 'snapshots')];
    expect(mid(SUMMARY_EVERY - 1)).toEqual([false, false]);
    expect(mid(SUMMARY_EVERY)).toEqual([true, true]);
    for (const status of ['done', 'cancelled', 'error'] as const) {
      expect([summariesDue(1, status), summariesDue(0, status)]).toEqual([true, false]);
    }
  });

  it('a cancelled or failed run with a few pending changes is due (the reducer statuses)', () => {
    const s = liveReducer(started(), { type: 'snapshot', index: 0, page: page(caps[0]!.ts, 'Old text.') });
    expect(summariesDue(1, s.status)).toBe(false);
    expect(summariesDue(1, liveReducer(s, { type: 'cancel' }).status)).toBe(true);
    expect(summariesDue(1, liveReducer(s, { type: 'error', error: new ApiError('archive_unavailable', 'down') }).status)).toBe(true);
  });
});
