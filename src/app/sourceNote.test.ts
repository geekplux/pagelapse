import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from '../core/types.ts';
import { sourceNote } from './ChangesList.tsx';

const entry = (ai?: string) => ({ ruleSummary: 'rule', aiSummary: ai }) as TimelineEntry;

describe('sourceNote (the changes list says once where its summaries come from)', () => {
  it('names the three cases', () => {
    expect(sourceNote([entry(), entry()])).toBe('Summaries: auto summary (rules)');
    expect(sourceNote([entry('a'), entry('b')])).toBe('Summaries: AI summary (Workers AI)');
    expect(sourceNote([entry('a'), entry()])).toBe('Summaries: mixed: items marked AI are by Workers AI');
  });
});
