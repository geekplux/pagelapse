import { describe, expect, it } from 'vitest';
import { USER_AGENT } from '../src/archive/politeFetch.ts';
import cdx from '../test/fixtures/api/cdx-example.json';
import html from '../test/fixtures/html/wikipedia-article.html?raw';
import type { Env } from './env.ts';
import { handle } from './index.ts';

type Responder = (url: string) => Response;
/** Recorded responses: the CDX listing for any CDX query, the article for any `id_` capture. */
const recorded: Responder = (url) =>
  url.startsWith('https://web.archive.org/cdx/search/cdx?') ? new Response(JSON.stringify(cdx))
  : url.startsWith('https://web.archive.org/web/') && url.includes('id_/') ? new Response(html, { headers: { 'content-type': 'text/html' } })
  : new Response(null, { status: 404 });

/** The real handler over a fake KV, a fake rate limiter and a fake fetch that records every upstream call. */
function setup() {
  const store = new Map<string, string>();
  const puts: { key: string; value: string; ttl?: number }[] = [];
  const calls: { url: string; ua: string | null }[] = [];
  const waits: number[] = [];
  const s = { store, puts, calls, waits, respond: recorded, allow: true };
  const kv = {
    get: async (key: string, type?: string) => (store.has(key) ? (type === 'json' ? JSON.parse(store.get(key)!) : store.get(key)) : null),
    put: async (key: string, value: string, o?: { expirationTtl?: number }) => void (store.set(key, value), puts.push({ key, value, ttl: o?.expirationTtl })),
  };
  const env: Env = { CACHE: kv as unknown as KVNamespace, UPSTREAM_LIMIT: { limit: async () => ({ success: s.allow }) } as RateLimit };
  const io = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => (calls.push({ url: String(input), ua: new Headers(init?.headers).get('user-agent') }), s.respond(String(input))),
    sleep: async (ms: number) => void waits.push(ms),
  };
  const get = async (path: string) => {
    const res = await handle(new Request(`http://127.0.0.1${path}`, { headers: { 'cf-connecting-ip': '203.0.113.7' } }), env, io);
    return { res, body: (await res.json()) as Record<string, any> };
  };
  return Object.assign(s, { get });
}

describe('worker API', () => {
  it('GET /api/health answers without bindings or upstream calls, with security headers', async () => {
    const t = setup();
    const { res, body } = await t.get('/api/health');
    expect(body).toEqual({ ok: true, version: expect.any(String), ai: 'unavailable' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(t.calls).toEqual([]);
  });

  it('caches CDX for 24 h and captures forever, never raw HTML; a repeated run makes 0 upstream calls', async () => {
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
    expect(t.puts[0]).toMatchObject({ key: expect.stringMatching(/^cdx:v1:[0-9a-f]{64}$/), ttl: 86_400 });
    for (const p of t.puts.slice(1)) {
      expect(p).toMatchObject({ key: expect.stringMatching(/^snap:v1:e\d+:[0-9a-f]{64}:\d{14}$/), ttl: undefined });
      expect(p.value).not.toMatch(/<(?:html|head|body|div|p|script|nav)\b/i);
    }
    await run();
    expect(t.calls).toHaveLength(7);
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
    expect(t.puts.at(-1)).toMatchObject({ key: 'ia:cooldown', ttl: 60 });
    expect(t.calls).toHaveLength(2);
    expect((await t.get('/api/snapshot?url=other.org&ts=20200101000000')).body.error).toBe('archive_rate_limited');
    expect((await t.get('/api/snapshot?url=example.org&ts=20200101000000')).res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
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
    '/api/captures?url=localhost:3000', '/api/captures?url=printer.local', '/api/captures?url=https://user:pw@example.org/',
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
});
