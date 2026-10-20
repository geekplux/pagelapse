import { clip } from './changeRecord.ts';
import type { ChangeRecord } from './types.ts';

/** Longest rule summary, in characters. */
export const MAX_RULE_SUMMARY_CHARS = 120;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const quote = (text: string) => `"${clip(text, 48)}"`;
const sections = (verb: string, list: string[]) =>
  list.length === 1 ? `${verb} section ${quote(list[0]!)}` : `${verb} ${plural(list.length, 'section')} incl. ${quote(list[0]!)}`;

/**
 * Deterministic one-line summary of a change record (the "auto summary"), never empty and at
 * most {@link MAX_RULE_SUMMARY_CHARS} chars. Names the title and headings that changed when
 * there are any, otherwise counts reworded/added/removed passages; ends with word counts, e.g.
 * `Title changed to "Git"; added section "Downloads" (+140 / −62 words)`.
 */
export function ruleSummary(record: ChangeRecord): string {
  const { stats: s, headingsAdded, headingsRemoved } = record;
  const named = [
    record.titleChanged && `title changed to ${quote(record.title)}`,
    headingsAdded.length > 0 && sections('added', headingsAdded),
    headingsRemoved.length > 0 && sections('removed', headingsRemoved),
  ].filter((p): p is string => typeof p === 'string');
  const counted = [
    s.blocksModified > 0 && `reworded ${plural(s.blocksModified, 'passage')}`,
    s.blocksAdded > 0 && `added ${plural(s.blocksAdded, 'passage')}`,
    s.blocksRemoved > 0 && `removed ${plural(s.blocksRemoved, 'passage')}`,
  ].filter((p): p is string => typeof p === 'string');
  const parts = named.length ? named : [counted.join(', ') || 'moved content around'];
  let out = '';
  for (const part of parts) if (!out || out.length + part.length + 2 <= MAX_RULE_SUMMARY_CHARS) out = out ? `${out}; ${part}` : part;
  const words = `(+${s.wordsAdded} / −${s.wordsRemoved} words)`;
  if (s.wordsAdded + s.wordsRemoved > 0 && out.length + words.length < MAX_RULE_SUMMARY_CHARS) out += ` ${words}`;
  return clip(out.charAt(0).toUpperCase() + out.slice(1), MAX_RULE_SUMMARY_CHARS);
}
