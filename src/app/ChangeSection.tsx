import type { ReactNode } from 'react';
import { namedSections } from '../core/ruleSummary.ts';
import type { SnapshotPage, TimelineEntry } from '../core/types.ts';
import { shownSummary } from './describe.ts';
import { DiffView } from './diff/DiffView.tsx';
import { Ts } from './Ts.tsx';

interface Props {
  /** The change shown (the selected one, or the decade compare); none when nothing meaningful changed. */
  entry?: TimelineEntry | undefined;
  /** The earlier and the later capture of `entry`. */
  from?: SnapshotPage | undefined;
  to?: SnapshotPage | undefined;
  /** The archive's name, for the capture links ("16 Mar 2024 in Arquivo.pt"). */
  archive: string;
  captureUrl: (ts: string) => string;
  /** Shown instead of the change when there is none. */
  empty?: ReactNode;
}

const Arrow = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const quoted = (list: readonly string[]) => list.map((h) => `“${h}”`).join(', ');

/** What changed, in a few facts: words added and removed, sections new, gone and renamed. */
function Facts({ entry }: { entry: TimelineEntry }) {
  const { wordsAdded: plus, wordsRemoved: minus } = entry.record.stats;
  const { added, removed, renamed } = namedSections(entry.record);
  const rows: [string, ReactNode][] = [
    [
      'Words',
      <>
        <span className="num cs-plus" aria-hidden="true">+{plus}</span> <span className="num cs-minus" aria-hidden="true">−{minus}</span>
        <span className="sr-only">
          {plus} added, {minus} removed
        </span>
      </>,
    ],
  ];
  if (added.length) rows.push(['New sections', added.join(', ')]);
  if (removed.length) rows.push(['Gone', removed.join(', ')]);
  if (renamed.length) rows.push(['Renamed', renamed.map(([x, y]) => `${quoted([x])} to ${quoted([y])}`).join(', ')]);
  return (
    <dl className="cs-facts">
      {rows.map(([dt, dd]) => (
        <div key={dt}>
          <dt>{dt}</dt>
          <dd>{dd}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The change: on the left its two captures, the summary and where it came from, a few facts and the captures in the
 * archive; on the right the text diff. The skip link lands here (`#diff`), on the empty note when nothing changed.
 */
export function ChangeSection({ entry, from, to, archive, captureUrl, empty }: Props) {
  return (
    <section className="change-section" id="diff" tabIndex={-1} aria-labelledby={entry ? 'change-heading' : undefined} aria-label={entry ? undefined : 'The change'}>
      {entry && from && to ? (
        <>
          <div className="cs-side">
            <p className="cs-when">
              {(['before', 'after'] as const).map((side) => (
                <span key={side} data-side={side}>
                  <i className="vp-dot" data-side={side} aria-hidden="true" />
                  <b>{side === 'before' ? 'Before' : 'After'}</b> <Ts ts={side === 'before' ? entry.from : entry.to} />
                </span>
              ))}
            </p>
            <h3 id="change-heading" className="cs-summary">
              {shownSummary(entry)}
            </h3>
            <span className="tag">{entry.aiSummary ? 'AI summary' : 'Auto summary'}</span>
            <Facts entry={entry} />
            <p className="cs-links">
              {[entry.from, entry.to].map((ts) => (
                <a key={ts} href={captureUrl(ts)} target="_blank" rel="noopener noreferrer">
                  <span>
                    <Ts ts={ts} /> in {archive}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </span>
                  <Arrow />
                </a>
              ))}
            </p>
          </div>
          <DiffView key={`${entry.from}-${entry.to}`} entry={entry} from={from} to={to} />
        </>
      ) : (
        empty
      )}
    </section>
  );
}
