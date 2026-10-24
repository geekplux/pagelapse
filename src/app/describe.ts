import { formatTimestampLong } from '../core/timestamp.ts';
import type { TimelineEntry } from '../core/types.ts';

/**
 * The slider's value text keeps the rule summary: AI text arriving later then never changes it under the user's focus.
 * Spoken text for one change, e.g. "Change 4 of 11: 17 March 2014 to 2 June 2016, major: Added section 'Downloads'". */
export function describeChange(e: TimelineEntry, i: number, n: number): string {
  return `Change ${i + 1} of ${n}: ${formatTimestampLong(e.from)} to ${formatTimestampLong(e.to)}, ${e.significance.magnitude}: ${e.ruleSummary}`;
}

/**
 * The summary as the page shows it: the AI line as written, or the rule summary with curly quotes and without its
 * word counts (the change section lists those), e.g. `Added section “Downloads”`.
 */
export function shownSummary(e: Pick<TimelineEntry, 'ruleSummary' | 'aiSummary'>): string {
  return e.aiSummary ?? e.ruleSummary.replace(/ \(\+\d+ \/ −\d+ words\)$/, '').replace(/"([^"]*)"/g, '“$1”');
}
