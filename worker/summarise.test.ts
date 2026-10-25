import { describe, expect, it } from 'vitest';
import nasa from '../src/samples/nasa.json';
import wiki from '../src/samples/wikipedia-internet-archive.json';
import { fixtureToSnapshots, parseSampleFixture } from '../src/core/fixture.ts';
import { ruleSummary } from '../src/core/ruleSummary.ts';
import { buildTimeline } from '../src/core/timeline.ts';
import { snapKey } from './cache.ts';
import type { Env } from './env.ts';
import { readTextCapped } from './http.ts';
import { handle } from './index.ts';
import { MAX_BATCH, MAX_BATCH_CHARS, batches, messages } from './prompt.ts';
import { MAX_BODY } from './routes/summaries.ts';
import { summarise } from './summarise.ts';

const timeline = (j: unknown) => {
  const f = parseSampleFixture(j);
  return buildTimeline(f.url, fixtureToSnapshots(f));
};
const [nasaT, wikiT] = [timeline(nasa), timeline(wiki)];
const records = [...wikiT.entries, ...nasaT.entries].map((e) => e.record);

/** A fake KV, and a fake Workers AI that answers each numbered record with `line(n)` and logs every call. */
function setup(line: (n: number) => string = (n) => `Reworded the page's section number ${n}`) {
  const store = new Map<string, string>();
  const calls: { prompt: string; max_tokens: number }[] = [];
  const kv = {
    get: async (key: string, type?: string) => (store.has(key) ? (type === 'json' ? JSON.parse(store.get(key)!) : store.get(key)) : null),
    put: async (key: string, value: string) => void store.set(key, value),
  };
  const ai = {
    run: async (_model: string, input: { messages: { content: string }[]; max_tokens: number }) => {
      const prompt = input.messages[1]!.content;
      calls.push({ prompt, max_tokens: input.max_tokens });
      return { response: prompt.split('\n').map((_, i) => `${i + 1}. ${line(i + 1)}`).join('\n') };
    },
  };
  const env: Env = { CACHE: kv as unknown as KVNamespace, AI: ai as unknown as Ai };
  return { store, calls, env };
}

describe('summarise (Workers AI, fake binding)', () => {
  it(`batches <= ${MAX_BATCH} records and <= ${MAX_BATCH_CHARS} chars per call; records <= 1,200 chars`, async () => {
    const t = setup();
    const out = await summarise(t.env, 'https://example.org/', records, 'ip');
    expect(records.length).toBeGreaterThan(MAX_BATCH);
    expect(t.calls.map((c) => c.prompt.split('\n').length)).toEqual(batches(records).map((b) => b.length));
    expect(t.calls.every((c) => c.prompt.split('\n').length <= MAX_BATCH && c.prompt.length <= MAX_BATCH_CHARS)).toBe(true);
    for (const r of records) expect(messages([r])[1]!.content.length).toBeLessThanOrEqual(1200);
    expect(t.calls[0]!.prompt).not.toContain('"pair"');
    expect(out.every((s) => s.source === 'ai' && /^Reworded the page's section number \d$/.test(s.text))).toBe(true);
    expect(t.calls[0]!.max_tokens).toBe(48 * MAX_BATCH);
  });

  it('caches per pair: a second call makes 0 AI calls', async () => {
    const t = setup();
    const first = await summarise(t.env, 'https://example.org/', records.slice(0, 5), 'ip');
    expect([...t.store.keys()].filter((k) => k.startsWith('sum:v1:@cf/meta/llama-3.2-3b-instruct:p1:'))).toHaveLength(5);
    const again = await summarise(t.env, 'https://example.org/', records.slice(0, 5), 'ip');
    expect([t.calls.length, again]).toEqual([1, first]);
  });

  it('an invalid line falls back to the rule summary for that item only, and is not retried', async () => {
    const bad = ['short', 'See https://example.org for more', 'Moved to example.com now', 'x'.repeat(121)];
    const t = setup((n) => bad[n - 1] ?? `Updated release notes, item ${n}`);
    const batch = records.slice(0, 6);
    const out = await summarise(t.env, 'https://example.org/', batch, 'ip');
    expect(out.map((s) => s.source)).toEqual(['rule', 'rule', 'rule', 'rule', 'ai', 'ai']);
    expect(out[0]!.text).toBe(ruleSummary(batch[0]!));
    await summarise(t.env, 'https://example.org/', batch, 'ip');
    expect(t.calls).toHaveLength(1);
  });

  it('an AI error, a missing binding, the rate limit or the daily cap give rule summaries, uncached', async () => {
    const t = setup();
    const want = records.slice(0, 3).map((r) => ({ pair: r.pair, text: ruleSummary(r), source: 'rule' }));
    const run = (env: Env) => summarise(env, 'https://example.org/', records.slice(0, 3), 'ip');
    expect(await run({ ...t.env, AI: { run: async () => Promise.reject(new Error('boom')) } as unknown as Ai })).toEqual(want);
    expect(await run({ CACHE: t.env.CACHE })).toEqual(want);
    expect(await run({ ...t.env, AI_LIMIT: { limit: async () => ({ success: false }) } as RateLimit })).toEqual(want);
    t.store.set(`ai:day:${new Date().toISOString().slice(0, 10)}`, '3000');
    expect(await run(t.env)).toEqual(want);
    expect([t.calls.length, [...t.store.keys()].some((k) => k.startsWith('sum:'))]).toEqual([0, false]);
  });
});

describe('POST /api/summaries', () => {
  const post = async (env: Env, body: unknown) => {
    const res = await handle(new Request('http://127.0.0.1/api/summaries', { method: 'POST', body: JSON.stringify(body) }), env, {
      fetch: async () => Promise.reject(new Error('no upstream fetch allowed')),
    });
    return { res, body: (await res.json()) as { summaries?: { pair: string; source: string; text?: string }[]; error?: string } };
  };
  const pairs = nasaT.entries.slice(0, 3).map((e) => ({ from: e.from, to: e.to }));

  it('rebuilds records from KV only: cached pairs get AI text, the others "rule" with no text and no fetch', async () => {
    const t = setup();
    for (const p of nasaT.snapshots.slice(0, 3)) t.store.set(await snapKey('https://www.nasa.gov/', p.ts), JSON.stringify(p));
    const { res, body } = await post(t.env, { url: 'www.nasa.gov', pairs });
    expect([res.status, res.headers.get('cache-control')]).toEqual([200, 'no-store']);
    expect(body.summaries!.map((s) => [s.source, !!s.text])).toEqual([['ai', true], ['ai', true], ['rule', false]]);
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.prompt).toContain(JSON.stringify(nasaT.entries[0]!.record.headingsAdded));
  });

  it.each([{}, { url: 'www.nasa.gov', pairs: [] }, { url: 'www.nasa.gov', pairs: Array(9).fill(pairs[0]) }, { url: 'www.nasa.gov', pairs: [{ from: '2', to: '1' }] }])(
    'rejects a bad body with 400 (%#)',
    async (body) => {
      const t = setup();
      expect([(await post(t.env, body)).res.status, t.calls.length]).toEqual([400, 0]);
    },
  );

  it('rejects an oversized body by its Content-Length without reading it', async () => {
    const t = setup();
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(1024));
      },
    });
    const req = new Request('http://127.0.0.1/api/summaries', {
      method: 'POST', body, headers: { 'content-length': String(MAX_BODY + 1) }, duplex: 'half',
    } as RequestInit);
    const res = await handle(req, t.env);
    expect([res.status, t.calls.length, pulled <= 1]).toEqual([400, 0, true]);
  });

  it('stops reading a streamed body as soon as it passes the cap', async () => {
    const t = setup();
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const res = await handle(new Request('http://127.0.0.1/api/summaries', { method: 'POST', body, duplex: 'half' } as RequestInit), t.env);
    expect([res.status, t.calls.length]).toEqual([400, 0]);
    // An endless stream: the route must stop pulling just past MAX_BODY bytes (plus the stream's read-ahead).
    expect(pulled).toBeLessThanOrEqual(MAX_BODY / 1024 + 2);
  });

  it('readTextCapped returns the text of a body within the cap', async () => {
    const req = new Request('http://127.0.0.1/', { method: 'POST', body: 'héllo' });
    expect([await readTextCapped(req, 6), await readTextCapped(new Request('http://127.0.0.1/', { method: 'POST', body: 'héllo' }), 5)]).toEqual(['héllo', null]);
  });

  it('GET /api/health reports ai "available" with the binding', async () => {
    const res = await handle(new Request('http://127.0.0.1/api/health'), setup().env);
    expect(await res.json()).toMatchObject({ ai: 'available' });
  });
});
