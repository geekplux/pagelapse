import { formatTimestampLong } from '../core/timestamp.ts';
import type { TimelineEntry } from '../core/types.ts';

/** Spoken text for one change, e.g. "Change 4 of 11: 17 March 2014 to 2 June 2016, major: Added section 'Downloads'". */
export function describeChange(e: TimelineEntry, i: number, n: number): string {
  return `Change ${i + 1} of ${n}: ${formatTimestampLong(e.from)} to ${formatTimestampLong(e.to)}, ${e.significance.magnitude}: ${e.ruleSummary}`;
}

/** Compact stats line, e.g. "+142 / −37 words · 2 passages added · 1 reworded". */
export function statsLine({ stats: s }: TimelineEntry['record']): string {
  const parts = [`+${s.wordsAdded} / −${s.wordsRemoved} words`];
  if (s.blocksAdded) parts.push(`${s.blocksAdded} added`);
  if (s.blocksRemoved) parts.push(`${s.blocksRemoved} removed`);
  if (s.blocksModified) parts.push(`${s.blocksModified} reworded`);
  return parts.join(' · ');
}
