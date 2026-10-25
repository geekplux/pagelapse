import { clip } from './changeRecord.ts';
import type { ChangeRecord } from './types.ts';

/** Longest rule summary, in characters. */
export const MAX_RULE_SUMMARY_CHARS = 120;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** How a summary is written: straight quotes and word counts (stored, sent to the model), or for display. */
export interface SummaryStyle {
  /** Opening and closing marks around names; default straight double quotes. */
  quotes?: readonly [string, string];
  /** Append "(+n / −n words)"; default true. */
  words?: boolean;
}
const lower = (s: string) => s.toLowerCase();

/**
 * The most telling heading of `list`: a few words beat one ("Why Rust?" over "Rust"), a long tagline loses,
 * and a heading that only repeats the page title loses. Ties go to the first, in page order.
 */
function informative(list: string[], title: string): string {
  const score = (h: string) => {
    const w = h.split(/\s+/).length;
    return Math.min(w, 4) - (w > 8 ? 5 : 0) - (lower(title).includes(lower(h)) ? 3 : 0);
  };
  return list.reduce((best, h) => (score(h) > score(best) ? h : best));
}

const sections = (quote: Quote, verb: string, list: string[], title: string) => {
  const h = informative(list, title);
  return list.length === 1 ? `${verb} section ${quote(h)}` : `${verb} ${plural(list.length, 'section')} incl. ${quote(h)}`;
};

type Quote = (text: string, max?: number) => string;

/** Release-style numbers: `1.69.0`, `v2.1.0`, `Version 1.44`. */
const VERSION = /\bversion\s+(\d+(?:\.\d+)+)|\bv?(\d+\.\d+\.\d+(?:\.\d+)?)\b/gi;
const versions = (text: string) => [...text.matchAll(VERSION)].map((m) => m[1] ?? m[2]!);

/** `updated version A to B` for the first edited passage whose release number changed. */
function versionBump(r: ChangeRecord): string | undefined {
  for (const m of r.modified) {
    const [before, after] = [versions(m.before), versions(m.after)];
    const i = before.findIndex((v, k) => after[k] !== undefined && after[k] !== v);
    if (i >= 0) return `updated version ${before[i]} to ${after[i]}`;
  }
}

/** The sections a change added, removed and renamed; a heading that only changed case and moved is not news. */
export function namedSections(record: ChangeRecord): { added: string[]; removed: string[]; renamed: [string, string][] } {
  const same = (x: string, list: string[]) => list.some((y) => lower(y) === lower(x));
  return {
    added: record.headingsAdded.filter((h) => !same(h, record.headingsRemoved)),
    removed: record.headingsRemoved.filter((h) => !same(h, record.headingsAdded)),
    renamed: (record.headingsRenamed ?? []).filter(([x, y]) => lower(x) !== lower(y)),
  };
}

/**
 * Deterministic one-line summary of a change record (the "auto summary"), never empty and at
 * most {@link MAX_RULE_SUMMARY_CHARS} chars. Names the title, renamed/added/removed headings
 * (the most informative one) and version bumps when there are any, otherwise counts
 * reworded/added/removed passages; ends with word counts, e.g.
 * `Renamed section "Cyberattacks" to "2024 cyberattacks" (+304 / −220 words)`.
 */
export function ruleSummary(record: ChangeRecord, style: SummaryStyle = {}): string {
  const { stats: s, title } = record;
  const [open, close] = style.quotes ?? ['"', '"'];
  const quote: Quote = (text, max = 48) => `${open}${clip(text, max)}${close}`;
  const { added, removed, renamed } = namedSections(record);
  const [from, to] = renamed[0] ?? ['', ''];
  const named = [
    record.titleChanged && `title changed to ${quote(title)}`,
    renamed.length === 1 && `renamed section ${quote(from, 40)} to ${quote(to, 40)}`,
    renamed.length > 1 && `renamed ${plural(renamed.length, 'section')} incl. ${quote(to)}`,
    added.length > 0 && sections(quote, 'added', added, title),
    removed.length > 0 && sections(quote, 'removed', removed, title),
  ].filter((p): p is string => typeof p === 'string');
  const counted = [
    s.blocksModified > 0 && `reworded ${plural(s.blocksModified, 'passage')}`,
    s.blocksAdded > 0 && `added ${plural(s.blocksAdded, 'passage')}`,
    s.blocksRemoved > 0 && `removed ${plural(s.blocksRemoved, 'passage')}`,
  ].filter((p): p is string => typeof p === 'string');
  const bump = versionBump(record);
  const parts = named.length ? named : [counted.join(', ') || (bump ? '' : 'moved content around')].filter(Boolean);
  // After the title and a rename, before sections: "2.1.0 to 2.2.0" is the news on a release page.
  if (bump) parts.splice(named.length ? Number(!!record.titleChanged) + Number(renamed.length > 0) : 0, 0, bump);
  let out = '';
  for (const part of parts) if (!out || out.length + part.length + 2 <= MAX_RULE_SUMMARY_CHARS) out = out ? `${out}; ${part}` : part;
  const words = `(+${s.wordsAdded} / −${s.wordsRemoved} words)`;
  if (style.words !== false && s.wordsAdded + s.wordsRemoved > 0 && out.length + words.length < MAX_RULE_SUMMARY_CHARS) out += ` ${words}`;
  return clip(out.charAt(0).toUpperCase() + out.slice(1), MAX_RULE_SUMMARY_CHARS);
}
