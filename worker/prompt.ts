// The summariser's prompt v1, output parsing and batching (PLAN 5.5): pure, shared by the Worker (worker/summarise.ts,
// the only code that calls the model) and the optional sample baker (scripts/bake-sample-summaries.ts).
import { ruleSummary } from '../src/core/ruleSummary.ts';
import type { ChangeRecord } from '../src/core/types.ts';

export const MODEL = '@cf/meta/llama-3.2-3b-instruct';
export const PROMPT_VERSION = 1;
export const MAX_BATCH = 8;
export const MAX_BATCH_CHARS = 10_000;
const SYSTEM =
  'You summarise how a web page changed between two archived captures. For each numbered change, reply with exactly one line: `<n>. <summary>`. Each summary is at most 90 characters, neutral, past tense, names concrete things (sections, claims, products of the page itself), no speculation, no quotes, no URLs.';

export interface Summary {
  pair: string;
  text: string;
  source: 'ai' | 'rule';
}

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
