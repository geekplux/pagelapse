import type { ReactNode } from 'react';

interface Props {
  changes: number;
  trivial: number;
  showTrivial: boolean;
  onTrivial: (on: boolean) => void;
  /** Extra legend items (live runs: pending and failed captures). */
  children?: ReactNode;
}

/**
 * The timeline's key, folded behind "Key, N trivial hidden" ("Timeline key" with no trivial edits): the legend (`#timeline-legend`, also the slider's
 * description, which works while folded) and the "Show trivial edits" toggle.
 */
export function Legend({ changes, trivial, showTrivial, onTrivial, children }: Props) {
  return (
    <details className="fold tl-key">
      <summary>
        {trivial > 0 ? `Key, ${trivial} trivial ${showTrivial ? 'shown' : 'hidden'}` : 'Timeline key'}
      </summary>
      <p className="captures-source tl-legend" id="timeline-legend">
        <span>
          {changes} meaningful changes. Bigger, bolder marks changed more:{' '}
          {(['minor', 'moderate', 'major'] as const).map((m) => (
            <span key={m} className="nowrap">
              <i className="mag-dot" data-magnitude={m} /> {m}{' '}
            </span>
          ))}
        </span>
        {trivial > 0 && (
          <span>
            <i className="mag-tick" /> {trivial} trivial captures {showTrivial ? 'shown as hollow entries.' : 'hidden (dates, counters, whitespace).'}
          </span>
        )}
        {children}
      </p>
      {trivial > 0 && (
        <label className="toggle">
          <input type="checkbox" checked={showTrivial} onChange={(e) => onTrivial(e.currentTarget.checked)} /> Show trivial edits
        </label>
      )}
    </details>
  );
}
