import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION, HttpError, RateLimitedError, USER_AGENT, decodeBody, mapLimit, politeFetch } from './politeFetch.ts';

type Step = number | Error | { status: number; headers?: Record<string, string>; body?: BodyInit };

/** Fake fetch that plays `steps` in order and records every request; fake sleep records waits. */
function harness(steps: Step[], extra: object = {}) {
  const requests: { url: string; ua: string | null }[] = [];
  const waits: number[] = [];
  const opts = {
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), ua: new Headers(init?.headers).get('user-agent') });
      const step = steps.shift() ?? 200;
      if (step instanceof Error) throw step;
      const { status, headers, body } = typeof step === 'number' ? { status: step } : step;
      return new Response(status === 200 ? (body ?? 'ok') : null, { status, headers });
    },
    sleep: async (ms: number) => void waits.push(ms),
    random: () => 0.5,
    ...extra,
  };
  return { requests, waits, call: () => politeFetch('https://archive.test/x', opts) };
}

describe('politeFetch', () => {
  it('sends the identified User-Agent on every attempt', async () => {
    expect(USER_AGENT).toBe(`pagelapse/${APP_VERSION} (+https://github.com/geekplux/pagelapse)`);
    expect(pkg.version).toBe(APP_VERSION);
    const h = harness([503, 503, 200]);
    expect((await h.call()).text).toBe('ok');
    expect(h.requests.map((r) => r.ua)).toEqual([USER_AGENT, USER_AGENT, USER_AGENT]);
  });

  it.each([429, 502, 503, 504])('backs off 1 s then 2 s on %i, and gives up after 3 attempts', async (status) => {
    const h = harness([status, status, status]);
    await expect(h.call()).rejects.toBeInstanceOf(status === 429 ? RateLimitedError : HttpError);
    expect(h.requests).toHaveLength(3);
    expect(h.waits).toEqual([1000, 2000]);
  });

  it('jitters backoff within ±20% and retries network errors', async () => {
    const lo = harness([new TypeError('reset'), new TypeError('reset'), 200], { random: () => 0 });
    await lo.call();
    expect(lo.waits).toEqual([800, 1600]);
    const hi = harness(Array.from({ length: 4 }, () => new TypeError('reset')), { random: () => 1, maxAttempts: 4 });
    await expect(hi.call()).rejects.toThrow('reset');
    expect(hi.waits).toEqual([1200, 2400, 4800]);
  });

  it('honours Retry-After up to 30 s and surfaces longer waits', async () => {
    const ok = harness([{ status: 429, headers: { 'retry-after': '7' } }, 200]);
    await ok.call();
    expect(ok.waits).toEqual([7000]);
    const date = new Date(Date.now() + 120_000).toUTCString();
    const long = harness([{ status: 503, headers: { 'retry-after': date } }]);
    const err = await long.call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).retryAfter).toBeGreaterThan(100);
    expect(long.requests).toHaveLength(1);
  });

  it('never retries sooner than the backoff, even on Retry-After: 0', async () => {
    const h = harness([{ status: 503, headers: { 'retry-after': '0' } }, { status: 503, headers: { 'retry-after': '1' } }, 200]);
    await h.call();
    expect(h.waits).toEqual([1000, 2000]);
  });

  it('with retry429: false, a 429 throws at once with its Retry-After (default 60 s)', async () => {
    const h = harness([{ status: 429, headers: { 'retry-after': '12' } }], { retry429: false });
    await expect(h.call()).rejects.toMatchObject({ name: 'RateLimitedError', retryAfter: 12 });
    const d = harness([429], { retry429: false });
    await expect(d.call()).rejects.toMatchObject({ retryAfter: 60 });
    expect([h.requests.length, d.requests.length, ...h.waits, ...d.waits]).toEqual([1, 1]);
  });

  it.each([403, 404, 410, 500])('does not retry %i', async (status) => {
    const h = harness([status]);
    await expect(h.call()).rejects.toMatchObject({ name: 'HttpError', status });
    expect(h.requests).toHaveLength(1);
  });

  it('cuts the body at maxBytes', async () => {
    const h = harness([{ status: 200, body: 'x'.repeat(5000) }], { maxBytes: 1000 });
    expect(await h.call()).toMatchObject({ text: 'x'.repeat(1000), truncated: true });
  });

  it('does not flag a body that ends exactly at maxBytes on a chunk boundary', async () => {
    const chunked = (...parts: string[]) =>
      new ReadableStream<Uint8Array>({ start: (c) => (parts.forEach((p) => c.enqueue(new TextEncoder().encode(p))), c.close()) });
    const exact = harness([{ status: 200, body: chunked('x'.repeat(600), 'y'.repeat(400)) }], { maxBytes: 1000 });
    expect(await exact.call()).toMatchObject({ text: `${'x'.repeat(600)}${'y'.repeat(400)}`, truncated: false });
    const over = harness([{ status: 200, body: chunked('x'.repeat(1000), 'z') }], { maxBytes: 1000 });
    expect(await over.call()).toMatchObject({ text: 'x'.repeat(1000), truncated: true });
  });

  it('aborts a hung request after timeoutMs', async () => {
    const hang = (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
    const h = harness([], { fetch: hang, timeoutMs: 5, maxAttempts: 1 });
    await expect(h.call()).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});

describe('decodeBody', () => {
  const cafe = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in ISO-8859-1
  it.each([
    ['header charset', cafe, 'text/html; charset=ISO-8859-1', 'café'],
    ['meta charset', new Uint8Array([...new TextEncoder().encode('<meta charset="windows-1252">'), 0xe9]), 'text/html', '<meta charset="windows-1252">é'],
    ['http-equiv', new Uint8Array([...new TextEncoder().encode('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">'), 0xe9]), null, '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">é'],
    ['default utf-8', new TextEncoder().encode('café'), null, 'café'],
    ['unknown label', new TextEncoder().encode('café'), 'text/html; charset=x-nope', 'café'],
  ])('%s', (_name, bytes, type, text) => expect(decodeBody(bytes, type)).toBe(text));
});

describe('mapLimit', () => {
  it('never exceeds its limit and keeps order', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (n, i) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10 + i;
    });
    expect(peak).toBe(2);
    expect(out).toEqual([50, 11, 42, 23, 34, 5]);
    expect(await mapLimit([], 2, async () => 1)).toEqual([]);
  });
});
