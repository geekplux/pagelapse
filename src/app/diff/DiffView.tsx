import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, SnapshotPage, TimelineEntry } from '../../core/types.ts';
import { formatTimestampLong } from '../../core/timestamp.ts';
import { statsLine } from '../describe.ts';
import { Ts } from '../Ts.tsx';
import { DiffBlock } from './DiffBlock.tsx';
import { type EqualOp, collapseUnchanged, unchangedLabel } from './rows.ts';

interface Props {
  entry: TimelineEntry;
  index: number;
  count: number;
  /** The earlier and the later capture of `entry`. */
  from: SnapshotPage;
  to: SnapshotPage;
  captureUrl: (ts: string) => string;
  onSelect: (i: number) => void;
}

/** A collapsed run of unchanged blocks; expanding it moves focus to the revealed blocks. */
function Gap({ ops, b }: { ops: EqualOp[]; b: readonly Block[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) {
    return (
      <button type="button" className="db-gap" onClick={() => setOpen(true)}>
        {unchangedLabel(ops.map((o) => b[o.b]?.kind ?? 'paragraph'))}
      </button>
    );
  }
  return (
    // A named group, not a <fieldset>: these are revealed text blocks, not form controls.
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div className="db-open" role="group" aria-label={`${ops.length} unchanged blocks`} tabIndex={-1} ref={ref}>
      {ops.map((op) => (
        <DiffBlock key={op.b} op={op} a={[]} b={b} />
      ))}
    </div>
  );
}

/** The selected change, marked up like a proofreader's galley: header, summary, structure, legend, then the diff. */
export function DiffView({ entry, index, count, from, to, captureUrl, onSelect }: Props) {
  const pair = `${entry.from}-${entry.to}`;
  const rows = useMemo(() => collapseUnchanged(entry.diff.ops), [entry]);
  // The confirmation belongs to the change it was given for.
  const [copied, setCopied] = useState({ pair: '', text: '' });
  // Clear first, then set on the next frame, so pressing again re-announces the same text.
  const announce = (text: string) => {
    setCopied({ pair: '', text: '' });
    requestAnimationFrame(() => setCopied({ pair, text }));
  };
  const copy = () =>
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(location.href))
      .then(
        () => announce('Link copied'),
        () => announce('Could not copy: the link is in the address bar'),
      );
  const r = entry.record;
  const structure: [string, string][] = [
    ...(entry.diff.titleChanged ? [['modified', `Title “${from.title}” became “${to.title}”`] as [string, string]] : []),
    ...r.headingsRemoved.map((h): [string, string] => ['removed', `Removed heading “${h}”`]),
    ...r.headingsAdded.map((h): [string, string] => ['added', `Added heading “${h}”`]),
  ];

  return (
    <section className="change-panel" id="diff" tabIndex={-1} aria-labelledby="change-heading">
      <h3 id="change-heading">
        <span className="panel-kicker mono">
          Change {index + 1} of {count} ·{' '}
          <span className="change-mag" data-magnitude={entry.significance.magnitude}>
            {entry.significance.magnitude}
          </span>
        </span>{' '}
        <Ts ts={entry.from} /> <span aria-hidden="true">→</span>
        <span className="sr-only"> to </span> <Ts ts={entry.to} />
      </h3>
      <p className="panel-links">
        {[entry.from, entry.to].map((ts) => (
          <a key={ts} className="cap-out" href={captureUrl(ts)} target="_blank" rel="noopener noreferrer">
            View capture <Ts ts={ts} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ))}
        <button type="button" className="btn" onClick={copy}>
          Copy link
        </button>
        {/* An explicit status role is the most widely announced live region; <output> support varies. */}
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <span role="status">{copied.pair === pair ? copied.text : ''}</span>
      </p>
      <p className="panel-summary">
        {entry.ruleSummary} <span className="source-label mono">auto summary</span>
      </p>
      <p className="panel-stats mono">{statsLine(r)}</p>
      {structure.length > 0 && (
        <>
          <h4 className="diff-sub">Structure</h4>
          <ul className="diff-structure">
            {structure.map(([op, text]) => (
              <li key={text} data-op={op}>
                {text}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="diff-legend">
        <span>Key:</span>
        <span><b aria-hidden="true" data-op="added">+</b> added, <span className="w-ins">underlined</span></span>
        <span><b aria-hidden="true" data-op="removed">−</b> removed, <span className="w-del">struck through</span></span>
        <span><b aria-hidden="true" data-op="modified">~</b> changed</span>
        <span><b aria-hidden="true" data-op="moved">↕</b> moved</span>
      </p>
      <div className="diff-body" key={pair}>
        {rows.map((row, i) =>
          'gap' in row ? <Gap key={i} ops={row.gap} b={to.blocks} /> : <DiffBlock key={i} op={row.op} a={from.blocks} b={to.blocks} />,
        )}
      </div>
      <nav className="diff-nav" aria-label="Previous and next change">
        <button type="button" className="btn" aria-disabled={index === 0} onClick={() => index > 0 && onSelect(index - 1)}>
          <span aria-hidden="true">‹ </span>Previous
        </button>
        <span className="mono" aria-live="polite">
          <span aria-hidden="true">
            {index + 1} / {count}
          </span>
          <span className="sr-only">
            Change {index + 1} of {count}: {formatTimestampLong(entry.from)} to {formatTimestampLong(entry.to)}, {entry.significance.magnitude}
          </span>
        </span>
        <button type="button" className="btn" aria-disabled={index === count - 1} onClick={() => index < count - 1 && onSelect(index + 1)}>
          Next<span aria-hidden="true"> ›</span>
        </button>
      </nav>
    </section>
  );
}
