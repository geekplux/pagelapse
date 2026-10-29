import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER_AGENT } from '../src/archive/politeFetch.ts';
import cdx from '../test/fixtures/api/cdx-example.json';
import html from '../test/fixtures/html/wikipedia-article.html?raw';
import { memoryKv } from './cache.ts';
import type { Env } from './env.ts';
import { handle } from './index.ts';
import { changePoints, fit } from './routes/gallery.ts';

type Responder = (url: string) => Response;
/** Recorded responses: the CDX listing for any CDX query, the article for any `id_` capture. */
const recorded: Responder = (url) =>
  url.startsWith('https://web.archive.org/cdx/search/cdx?') ? new Response(JSON.stringify(cdx))
  : url.startsWith('https://web.archive.org/web/') && url.includes('id_/') ? new Response(html, { headers: { 'content-type': 'text/html' } })
  : new Response(null, { status: 404 });

/** The real handler over a fake KV, a fake rate limiter and a fake fetch that records every upstream call. */
function setup() {
  const store = new Map<string, string>();
  const puts: { key: string; value: string; ttl?: number; metadata?: unknown }[] = [];
  const meta = new Map<string, unknown>();
  const calls: { url: string; ua: string | null }[] = [];
  const waits: number[] = [];
  const s = { store, puts, calls, waits, respond: recorded, allow: true };
  const kv = {
    get: async (key: string, type?: string) => (store.has(key) ? (type === 'json' ? JSON.parse(store.get(key)!) : store.get(key)) : null),
    put: async (key: string, value: string, o?: { expirationTtl?: number; metadata?: unknown }) =>
      void (store.set(key, value), meta.set(key, o?.metadata), puts.push({ key, value, ttl: o?.expirationTtl, metadata: o?.metadata })),
    getWithMetadata: async (key: string) => ({ value: store.get(key) ?? null, metadata: meta.get(key) ?? null }),
    list: async ({ prefix = '', limit = 1000, cursor }: { prefix?: string; limit?: number; cursor?: string }) => {
      const names = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const from = Number(cursor) || 0;
      const done = from + limit >= names.length;
      return { keys: names.slice(from, from + limit).map((name) => ({ name, metadata: meta.get(name) })), list_complete: done, ...(!done && { cursor: String(from + limit) }) };
    },
  };
  const env: Env = { CACHE: kv as unknown as KVNamespace, UPSTREAM_LIMIT: { limit: async () => ({ success: s.allow }) } as RateLimit };
  const io = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => (calls.push({ url: String(input), ua: new Headers(init?.headers).get('user-agent') }), s.respond(String(input))),
    sleep: async (ms: number) => void waits.push(ms),
  };
  const get = async (path: string, init?: RequestInit) => {
    const res = await handle(new Request(`http://127.0.0.1${path}`, { ...init, headers: { 'cf-connecting-ip': '203.0.113.7' } }), env, io);
    return { res, body: (await res.json()) as Record<string, any> };
  };
  const share = (url: string) => get('/api/gallery', { method: 'POST', body: JSON.stringify({ url }) });
  return Object.assign(s, { get, share, env });
}

describe('worker API', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('GET /api/health answers without bindings or upstream calls, with security headers', async () => {
    const t = setup();
    const { res, body } = await t.get('/api/health');
    expect(body).toEqual({ ok: true, version: expect.any(String), ai: 'unavailable' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(t.calls).toEqual([]);
  });

  it('keeps CDX (fresh for 24 h) and captures forever, never raw HTML; a repeated run makes 0 upstream calls', async () => {
    const t = setup();
    const run = async () => {
      const { res, body } = await t.get('/api/captures?url=example.org/?utm_source=x&max=6');
      expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
      expect(body).toMatchObject({ url: 'https://example.org/', totalCaptures: 15, firstTs: '20080615120000', lastTs: '20250615120000' });
      for (const c of body.captures as { ts: string }[]) {
        const snap = await t.get(`/api/snapshot?url=${encodeURIComponent(body.url)}&ts=${c.ts}`);
        expect(snap.res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect(snap.body).toMatchObject({ ts: c.ts, title: expect.any(String), blocks: expect.any(Array) });
      }
      return body.captures.length as number;
    };
    expect(await run()).toBe(6);
    expect(t.calls).toHaveLength(7);
    expect(t.calls.every((c) => c.ua === USER_AGENT)).toBe(true);
    expect(t.calls[1]!.url).toMatch(/^https:\/\/web\.archive\.org\/web\/\d{14}id_\/https:\/\/example\.org\/$/);
    expect(t.puts[0]).toMatchObject({ key: expect.stringMatching(/^cdx:v2:[0-9a-f]{64}$/), ttl: undefined });
    expect(JSON.parse(t.puts[0]!.value)).toMatchObject({ at: expect.any(Number), value: expect.any(Array) });
    for (const p of t.puts.slice(1)) {
      expect(p).toMatchObject({ key: expect.stringMatching(/^snap:v1:e\d+:[0-9a-f]{64}:\d{14}$/), ttl: undefined });
      expect(p.value).not.toMatch(/<(?:html|head|body|div|p|script|nav)\b/i);
    }
    await run();
    expect(t.calls).toHaveLength(7);
  });

  it('refreshes a CDX listing after 24 h, and serves the kept one when the archive refuses or fails', async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    const t = setup();
    expect((await t.get('/api/captures?url=example.org')).body.totalCaptures).toBe(15);
    vi.setSystemTime(1_000_000 + 25 * 3600_000);
    for (const status of [502, 504, 429]) {
      t.respond = () => new Response(null, { status });
      const before = t.calls.length;
      const { res, body } = await t.get('/api/captures?url=example.org');
      expect([res.status, body.totalCaptures, t.calls.length > before]).toEqual([200, 15, true]);
    }
    // The 429 started the cooldown: the kept listing is served without another upstream call.
    const before = t.calls.length;
    expect((await t.get('/api/captures?url=example.org')).res.status).toBe(200);
    expect(t.calls).toHaveLength(before);
    t.store.delete('ia:cooldown');
    t.respond = recorded;
    expect((await t.get('/api/captures?url=example.org')).res.status).toBe(200);
    expect(JSON.parse(t.puts.at(-1)!.value).at).toBe(1_000_000 + 25 * 3600_000);
  });

  it('an exclusion wins over a kept CDX listing', async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    const t = setup();
    await t.get('/api/captures?url=example.org');
    vi.setSystemTime(1_000_000 + 25 * 3600_000);
    t.respond = () => new Response(null, { status: 403 });
    expect((await t.get('/api/captures?url=example.org')).body.error).toBe('excluded');
  });

  it('retries a 503 after its Retry-After, as a floor over the backoff', async () => {
    const t = setup();
    let first = true;
    t.respond = (url) => (first ? ((first = false), new Response(null, { status: 503, headers: { 'retry-after': '3' } })) : recorded(url));
    expect((await t.get('/api/captures?url=example.org')).res.status).toBe(200);
    expect([t.calls.length, ...t.waits]).toEqual([2, 3000]);
  });

  it('a 429 is not retried and starts a 60 s global cooldown; cached answers still flow', async () => {
    const t = setup();
    await t.get('/api/snapshot?url=example.org&ts=20200101000000');
    t.respond = () => new Response(null, { status: 429 });
    const { res, body } = await t.get('/api/captures?url=example.org');
    expect([res.status, res.headers.get('retry-after'), body.error, body.retryAfter]).toEqual([503, '60', 'archive_rate_limited', 60]);
    expect(t.puts.at(-1)).toMatchObject({ key: 'ia:cooldown', ttl: 86_400 });
    expect(t.calls).toHaveLength(2);
    expect((await t.get('/api/snapshot?url=other.org&ts=20200101000000')).body.error).toBe('archive_rate_limited');
    expect((await t.get('/api/snapshot?url=example.org&ts=20200101000000')).res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('logs each archive failure with its Retry-After, the cooldown, and how long the archive refused once it answers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logged = () => warn.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    const t = setup();
    t.respond = () => new Response(null, { status: 429, headers: { 'retry-after': '90' } });
    expect((await t.get('/api/captures?url=example.org')).body.retryAfter).toBe(90);
    expect((await t.get('/api/captures?url=example.org')).body.error).toBe('archive_rate_limited');
    vi.setSystemTime(1_000_000 + 91_000);
    t.respond = () => new Response(null, { status: 429 });
    expect((await t.get('/api/captures?url=example.org')).body.retryAfter).toBe(60);
    vi.setSystemTime(1_000_000 + 152_000);
    t.respond = recorded;
    expect((await t.get('/api/captures?url=example.org')).res.status).toBe(200);
    expect(logged()).toEqual([
      { event: 'archive_failure', kind: 'cdx', status: 429, retryAfter: '90', attempt: 1 },
      { event: 'archive_cooldown_start', kind: 'cdx', status: 429, cooldown: 90, retryAfter: '90', streak: 0 },
      { event: 'archive_cooldown_hit', kind: 'cdx', wait: 90 },
      { event: 'archive_failure', kind: 'cdx', status: 429, retryAfter: null, attempt: 1 },
      { event: 'archive_cooldown_start', kind: 'cdx', status: 429, cooldown: 60, retryAfter: null, streak: 91 },
      { event: 'archive_recovered', kind: 'cdx', after: 152 },
    ]);
    expect(JSON.stringify(logged())).not.toMatch(/example\.org|203\.0\.113/);
  });

  it.each([521, 522, 523])('a refused connection (%i) is not retried and starts the cooldown, like a 429', async (status) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    t.respond = () => new Response(null, { status });
    const { res, body } = await t.get('/api/captures?url=example.org');
    expect([res.status, body.error, body.retryAfter, t.calls.length]).toEqual([503, 'archive_rate_limited', 60, 1]);
    expect(t.puts.at(-1)).toMatchObject({ key: 'ia:cooldown', ttl: 86_400 });
    expect(warn.mock.calls.map(([l]) => JSON.parse(String(l)).event)).toEqual(['archive_failure', 'archive_cooldown_start']);
    expect(JSON.parse(String(warn.mock.calls[1]![0]))).toMatchObject({ status, cooldown: 60 });
    // The next lookup is turned away by the cooldown without reaching the archive.
    expect((await t.get('/api/captures?url=other.org')).body.error).toBe('archive_rate_limited');
    expect(t.calls).toHaveLength(1);
  });

  it('reads a cooldown stored by an older deploy as a bare end time', async () => {
    const t = setup();
    t.store.set('ia:cooldown', String(Date.now() + 30_000));
    expect((await t.get('/api/captures?url=example.org')).body).toMatchObject({ error: 'archive_rate_limited', retryAfter: 30 });
    expect(t.calls).toHaveLength(0);
  });

  it('a capture over 2 MB is too_large, remembered, and never refetched', async () => {
    const t = setup();
    t.respond = () => new Response('x'.repeat(2_000_001));
    for (let i = 0; i < 2; i++) {
      const { res, body } = await t.get('/api/snapshot?url=example.org&ts=20200101000000');
      expect([res.status, body.error]).toEqual([422, 'too_large']);
    }
    expect(t.calls).toHaveLength(1);
    expect(t.puts.map((p) => p.value)).toEqual(['{"error":"too_large"}']);
  });

  it.each([
    [() => new Response(null, { status: 403 }), 403, 'excluded'],
    [() => new Response('[]'), 404, 'no_captures'],
    [() => new Response(null, { status: 500 }), 502, 'archive_unavailable'],
    [() => new Response('<html>not json'), 502, 'archive_unavailable'],
  ] as [Responder, number, string][])('maps upstream failures to API errors (%#)', async (respond, status, error) => {
    const t = setup();
    t.respond = respond;
    const { res, body } = await t.get('/api/captures?url=example.org');
    expect([res.status, body.error, typeof body.message]).toEqual([status, error, 'string']);
  });

  it('enforces the per-IP upstream limit before any uncached call', async () => {
    const t = setup();
    t.allow = false;
    const { res, body } = await t.get('/api/captures?url=example.org');
    expect([res.status, body.error, t.calls.length]).toEqual([429, 'rate_limited', 0]);
  });

  it.each([
    '/api/captures', '/api/captures?url=ftp://example.org/', '/api/captures?url=http://127.0.0.1/', '/api/captures?url=http://[::1]/',
    '/api/captures?url=localhost:3000', '/api/captures?url=printer.local', '/api/captures?url=http://localhost./',
    '/api/captures?url=https://user:pw@example.org/',
    '/api/snapshot?url=example.org', '/api/snapshot?url=example.org&ts=2020', '/api/snapshot?url=example.org&ts=20201301000000',
  ])('rejects %s with 400 invalid_url', async (path) => {
    const t = setup();
    const { res, body } = await t.get(path);
    expect([res.status, body.error, t.calls.length]).toEqual([400, 'invalid_url', 0]);
  });

  it('answers unknown /api/* paths and methods with 404 JSON', async () => {
    const t = setup();
    expect(await t.get('/api/nope')).toMatchObject({ res: { status: 404 }, body: { error: 'not_found' } });
    const post = await handle(new Request('http://127.0.0.1/api/health', { method: 'POST' }), { CACHE: {} as KVNamespace });
    expect([post.status, post.headers.get('content-type')]).toEqual([404, 'application/json; charset=utf-8']);
  });

  it('works without a CACHE binding (Workers Builds previews): an in-memory cache, so a repeat makes no upstream call', async () => {
    const calls: string[] = [];
    const io = { fetch: async (input: RequestInfo | URL) => (calls.push(String(input)), recorded(String(input))), sleep: async () => {} };
    const get = (path: string) => handle(new Request(`http://127.0.0.1${path}`), {}, io);
    expect(await (await get('/api/health')).json()).toMatchObject({ ok: true, ai: 'unavailable' });
    for (let i = 0; i < 2; i++) expect((await get('/api/snapshot?url=example.org&ts=20200101000000')).status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});

describe('gallery', () => {
  /** Looks `url` up as the app does: its captures, then every sampled capture. */
  const lookUp = async (t: ReturnType<typeof setup>, url: string) => {
    const { body } = await t.get(`/api/captures?url=${encodeURIComponent(url)}&max=16`);
    for (const c of body.captures as { ts: string }[]) await t.get(`/api/snapshot?url=${encodeURIComponent(body.url)}&ts=${c.ts}`);
  };

  /** A page whose text is rewritten every few years, so its captures make meaningful changes. */
  const evolving: Responder = (url) => {
    if (!url.includes('id_/')) return recorded(url);
    const era = Math.floor(Number(url.match(/\/web\/(\d{4})/)![1]) / 5);
    const words = ['archive', 'library', 'museum', 'atlas', 'harbour', 'lantern', 'meadow', 'orchard'];
    const body = Array.from({ length: 12 }, (_, i) => `<p>${words[(era + i) % words.length]} ${era} paragraph number ${i} about the collection and its many visitors.</p>`).join('');
    return new Response(`<html><head><title>Era ${era}</title></head><body><main><h1>Era ${era}</h1>${body}</main></body></html>`, { headers: { 'content-type': 'text/html' } });
  };

  it('stores the changes: where each meaningful change falls, and how much changed', async () => {
    const t = setup();
    t.respond = evolving;
    await lookUp(t, 'example.org');
    await t.share('example.org');
    const [entry] = (await t.get('/api/gallery')).body.entries as { changes: [number, number][] }[];
    expect(entry!.changes.length).toBeGreaterThan(1);
    for (const [where, much] of entry!.changes) expect([where >= 0 && where <= 1000, much > 0 && much <= 100]).toEqual([true, true]);
    expect(entry!.changes.map(([w]) => w)).toEqual([...entry!.changes.map(([w]) => w)].sort((a, b) => a - b));
  });

  it('fills in the changes of an entry shared before they were stored, keeping its place', async () => {
    const t = setup();
    t.respond = evolving;
    await lookUp(t, 'example.org');
    await t.share('example.org');
    const key = [...t.store.keys()].find((k) => k.startsWith('gallery:v1:'))!;
    const { changes: _, ...old } = (await t.env.CACHE.getWithMetadata<{ changes?: unknown }>(key)).metadata!;
    await t.env.CACHE.put(key, '', { metadata: old });
    expect((await t.get('/api/gallery')).body.entries[0].changes).toBeUndefined();
    await t.share('example.org');
    const entries = (await t.get('/api/gallery')).body.entries as { added: number; changes?: unknown[] }[];
    expect([entries.length, entries[0]!.added, entries[0]!.changes!.length > 0]).toEqual([1, (old as { added: number }).added, true]);
    expect([...t.store.keys()].filter((k) => k.startsWith('gallery:v1:'))).toEqual([key]);
  });

  it('fits an entry into KV metadata: the title is cut first, then the changes', () => {
    const entry = (n: number) => ({ url: `https://example.org/${'a'.repeat(170)}`, title: '漫长的标题'.repeat(24), captures: 16, firstTs: '20000101000000', lastTs: '20260101000000', added: 1, changes: Array.from({ length: n }, (_, i): [number, number] => [i * 5, 50]) });
    const bytes = (e: object) => new TextEncoder().encode(JSON.stringify(e)).length;
    // The longest title shared (120 characters, 3 bytes each here) and a full strip of 15 changes fit as they are.
    const some = fit(entry(15));
    expect([bytes(some) <= 1000, some.title.length, some.changes!.length]).toEqual([true, 120, 15]);
    // Changes too many for any title: the title is cut to its floor, then the changes.
    const many = fit(entry(200));
    expect([bytes(many) <= 1000, many.title.length <= 20, many.changes!.length > 0 && many.changes!.length < 200]).toEqual([true, true, true]);
  });

  it('changePoints skips captures stored as too large, and one page has no changes', () => {
    const page = (text: string) => ({ title: 't', blocks: [{ kind: 'paragraph' as const, text }] });
    const caps = [{ ts: '20100101000000', digest: 'a', length: 1 }, { ts: '20200101000000', digest: 'b', length: 1 }];
    expect(changePoints('https://example.org/', caps, [page('one'), { error: 'too_large' } as never], caps[0]!.ts, caps[1]!.ts)).toEqual([]);
  });

  it('lists a looked-up page once, newest first, with its title and span, and never touches the archive', async () => {
    const t = setup();
    expect((await t.get('/api/gallery')).body).toEqual({ entries: [], more: false });
    await lookUp(t, 'example.org');
    await lookUp(t, 'example.org/about');
    const calls = t.calls.length;
    expect((await t.share('example.org')).body).toEqual({ shared: true });
    expect((await t.share('https://example.org/about')).body).toEqual({ shared: true });
    expect((await t.share('example.org')).body).toEqual({ shared: true });
    const { res, body } = await t.get('/api/gallery');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(body.entries.map((e: { url: string }) => e.url)).toEqual(['https://example.org/about', 'https://example.org/']);
    expect(body.entries[0]).toMatchObject({ title: expect.stringMatching(/\S/), captures: 15, firstTs: '20080615120000', lastTs: '20250615120000', added: expect.any(Number) });
    expect(t.calls).toHaveLength(calls);
  });

  it('refuses pages not looked up, addresses with a query (a fragment is dropped anyway), denied topics and blocked hosts', async () => {
    const t = setup();
    expect((await t.share('example.org')).body.message).toMatch(/^Look this page up first/);
    expect((await t.share('example.org/?id=7')).body.message).toMatch(/no \? or #/);
    expect((await t.share('bitcoin.example.org')).res.status).toBe(400);
    await lookUp(t, 'example.org');
    await t.share('example.org');
    t.store.set('gallery:block', JSON.stringify(['example.org']));
    expect((await t.get('/api/gallery')).body.entries).toEqual([]);
    expect((await t.share('example.org/about')).body.message).toMatch(/cannot be listed/);
    expect((await t.share('not a url')).body.error).toBe('invalid_url');
  });

  it('lists the newest 24 with `more`, and every entry, a page of 60 at a time, with ?all', async () => {
    const t = setup();
    for (let i = 0; i < 70; i++) {
      const url = `https://site${i}.example/`;
      await t.env.CACHE.put(`gallery:v1:${String(9_000_000 - i).padStart(13, '0')}:${i}`, '', { metadata: { url, title: `Site ${i}`, captures: 16, firstTs: '20000101000000', lastTs: '20260101000000', added: i } });
    }
    t.store.set('gallery:block', JSON.stringify(['site3.example']));
    const home = (await t.get('/api/gallery')).body;
    // Keys sort newest first: site69 was shared last.
    expect([home.entries.length, home.more, home.entries[0].url]).toEqual([24, true, 'https://site69.example/']);
    const first = await t.get('/api/gallery?all');
    expect(first.res.headers.get('cache-control')).toBe('public, max-age=300');
    expect([first.body.entries.length, typeof first.body.cursor]).toEqual([60, 'string']);
    const next = (await t.get(`/api/gallery?all&cursor=${first.body.cursor}`)).body;
    // The last page: sites 9 to 0 without the blocked site3.
    expect([next.entries.length, next.cursor, next.entries.at(-1).url]).toEqual([9, undefined, 'https://site0.example/']);
    expect(next.entries.some((e: { url: string }) => e.url.includes('site3.'))).toBe(false);
  });

  it('is limited per visitor', async () => {
    const t = setup();
    t.env.GALLERY_LIMIT = { limit: async () => ({ success: false }) } as RateLimit;
    expect((await t.share('example.org')).body.error).toBe('rate_limited');
  });

  it('works over memoryKv (previews), whose list keeps name order and metadata', async () => {
    const kv = memoryKv();
    await kv.put('gallery:v1:2', '', { metadata: { n: 2 } });
    await kv.put('gallery:v1:1', '', { metadata: { n: 1 } });
    await kv.put('other', '');
    expect((await kv.list({ prefix: 'gallery:v1:' })).keys).toEqual([{ name: 'gallery:v1:1', metadata: { n: 1 } }, { name: 'gallery:v1:2', metadata: { n: 2 } }]);
  });
});

describe('memoryKv', () => {
  it('stores text and JSON, honours expirationTtl and drops the oldest key past the cap', async () => {
    let t = 0;
    const kv = memoryKv(2, () => t);
    await kv.put('a', '{"n":1}');
    await kv.put('b', 'x', { expirationTtl: 60 });
    expect([await kv.get('a', 'json'), await kv.get('b')]).toEqual([{ n: 1 }, 'x']);
    t = 60_000;
    expect(await kv.get('b')).toBeNull();
    await kv.put('c', '1');
    await kv.put('d', '2');
    expect([await kv.get('a'), await kv.get('c'), await kv.get('d')]).toEqual([null, '1', '2']);
  });
});
