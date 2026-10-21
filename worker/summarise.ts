// The only place a model is used (PLAN 5.5, AC 10, 48): one short line per meaningful change, from its compact
// change record (never a page, never a picture), batched, cached per capture pair forever, capped per day.
import { ruleSummary } from '../src/core/ruleSummary.ts';
import type { ChangeRecord } from '../src/core/types.ts';
import { sha256 } from './cache.ts';
import type { Env } from './env.ts';

export const MODEL = '@cf/meta/llama-3.2-3b-instruct';
export const PROMPT_VERSION = 1;
export const MAX_BATCH = 8;
export const MAX_BATCH_CHARS = 10_000;
/** Approximate: a KV counter, read then written. */
export const DAILY_CAP = 3000;
const SYSTEM =
  'You summarise how a web page changed between two archived captures. For each numbered change, reply with exactly one line: `<n>. <summary>`. Each summary is at most 90 characters, neutral, past tense, names concrete things (sections, claims, products of the page itself), no speculation, no quotes, no URLs.';

export interface Summary {
  pair: string;
  text: string;
  source: 'ai' | 'rule';
}

/** Whether this Worker has Workers AI (production only, D11). */
export const aiAvailable = (env: Env): boolean => !!env.AI;

/** The chat messages for one batch: the numbered records, without their pair keys (the model has no use for them). */
export const messages = (records: readonly ChangeRecord[]) => [
  { role: 'system', content: SYSTEM },
  { role: 'user', content: records.map((r, i) => `${i + 1}. ${JSON.stringify(r, (k, v) => (k === 'pair' ? undefined : v))}`).join('\n') },
];

const echoes = (r: ChangeRecord) => [r.title, ...r.headingsAdded, ...r.headingsRemoved, ...r.added, ...r.removed];
/** A usable line: 8-120 chars, one line, no URL or domain, not a copy of the input. */
export const validLine = (text: string | undefined, r: ChangeRecord): text is string =>
  !!text && text.length >= 8 && text.length <= 120 && !/[\r\n]|:\/\/|www\.|\b[\w-]+\.(?:com|org|net|io|dev|app)\b/i.test(text) && !echoes(r).includes(text);

/** Each record's line from the model's `<n>. text` output; missing or invalid ones fall back to the rule summary. */
export function parseSummaries(output: string, records: readonly ChangeRecord[]): Summary[] {
  const lines = new Map<number, string>();
  for (const m of output.matchAll(/^\s*(\d+)[.)]\s+(.+?)\s*$/gm)) if (!lines.has(+m[1]!)) lines.set(+m[1]!, m[2]!);
  return records.map((r, i) => {
    const line = lines.get(i + 1);
    return validLine(line, r) ? { pair: r.pair, text: line, source: 'ai' } : { pair: r.pair, text: ruleSummary(r), source: 'rule' };
  });
}

/** Groups records into calls of at most {@link MAX_BATCH} records and {@link MAX_BATCH_CHARS} prompt chars. */
export function batches(records: readonly ChangeRecord[]): ChangeRecord[][] {
  const out: ChangeRecord[][] = [];
  for (const r of records) {
    const last = out.at(-1);
    if (last && last.length < MAX_BATCH && messages([...last, r])[1]!.content.length <= MAX_BATCH_CHARS) last.push(r);
    else out.push([r]);
  }
  return out;
}

const sumKey = async (url: string, pair: string) => `sum:v1:${MODEL}:p${PROMPT_VERSION}:${await sha256(url)}:${pair}`;
const rule = (r: ChangeRecord): Summary => ({ pair: r.pair, text: ruleSummary(r), source: 'rule' });

/** May this batch call the model? Within the per-client `AI_LIMIT` and the daily cap (counted here). */
async function allowed(env: Env, client: string): Promise<boolean> {
  if (env.AI_LIMIT && !(await env.AI_LIMIT.limit({ key: client })).success) return false;
  const day = `ai:day:${new Date().toISOString().slice(0, 10)}`;
  const used = Number(await env.CACHE.get(day));
  if (used >= DAILY_CAP) return false;
  await env.CACHE.put(day, String(used + 1), { expirationTtl: 2 * 86_400 });
  return true;
}

/**
 * Summaries of `records` (changes of `url`): cached ones from KV, the rest from Workers AI in batches, each result
 * cached forever per pair (an invalid line caches its rule fallback, so a pair costs at most one call, ever). No binding,
 * a limit, the cap or a model error gives rule summaries, uncached, so a later request may still get AI text.
 */
export async function summarise(env: Env, url: string, records: readonly ChangeRecord[], client: string): Promise<Summary[]> {
  const found = new Map<string, Summary>();
  const keys = new Map(await Promise.all(records.map(async (r) => [r.pair, await sumKey(url, r.pair)] as const)));
  for (const r of records) {
    const hit = await env.CACHE.get<Omit<Summary, 'pair'>>(keys.get(r.pair)!, 'json');
    if (hit) found.set(r.pair, { pair: r.pair, ...hit });
  }
  const ai = env.AI;
  for (const batch of ai ? batches(records.filter((r) => !found.has(r.pair))) : []) {
    if (!(await allowed(env, client))) break;
    try {
      const out = (await ai!.run(MODEL, { messages: messages(batch), temperature: 0.2, max_tokens: 48 * batch.length })) as { response?: string };
      for (const s of parseSummaries(String(out?.response ?? ''), batch)) {
        found.set(s.pair, s);
        await env.CACHE.put(keys.get(s.pair)!, JSON.stringify({ text: s.text, source: s.source }));
      }
    } catch (err) {
      console.error('workers ai error', err);
    }
  }
  return records.map((r) => found.get(r.pair) ?? rule(r));
}
