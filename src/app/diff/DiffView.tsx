import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * The selected change in the stage's side column: the change line (dates, magnitude, summary and its source), then one
 * controls row: Play (`lead`), Previous / Next, the pane's `tools`, and "Change details" (stats, capture links, Copy
 * link). Previous / Next's live region also says which capture the pane shows (`showing`); `quiet` silences it during
 * Play. On phones Previous / Next sticks to the bottom of the screen once the row has scrolled away above.
 */
export function ChangeCard({ entry, index, count, captureUrl, onSelect, showing, quiet, lead, tools }: Omit<Props, 'from' | 'to'> & { showing?: string | undefined; quiet?: boolean; lead?: ReactNode; tools?: ReactNode }) {
  const pair = `${entry.from}-${entry.to}`;
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

  // What Previous / Next's live region says: kept until the change, its place or the shown capture changes, so a live
  // run's growing total does not re-announce it with every change that arrives.
  const key = `${pair} ${index} ${showing ?? ''}`;
  const [said, setSaid] = useState({ key: '', text: '' });
  if (said.key !== key) {
    const text = `Change ${index + 1} of ${count}: ${formatTimestampLong(entry.from)} to ${formatTimestampLong(entry.to)}, ${entry.significance.magnitude}`;
    setSaid({ key, text: showing ? `${text}, showing ${showing}` : text });
  }

  // Stuck once its in-flow slot has scrolled out above the viewport (CSS fixes it to the bottom on phones only).
  const slot = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = slot.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([e]) => {
      if (!e) return;
      const out = !e.isIntersecting && e.boundingClientRect.top < 0;
      // The slot keeps the bar's in-flow width while the bar is fixed, so the row does not reflow.
      el.style.minWidth = out ? `${e.boundingClientRect.width}px` : '';
      setStuck(out);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="change-panel" aria-labelledby="change-heading">
      <h3 id="change-heading">
        <span className="panel-kicker mono">
          <span className="sr-only">Change {index + 1} of {count}, </span>
          <span className="change-mag" data-magnitude={entry.significance.magnitude}>
            {entry.significance.magnitude}
          </span>
        </span>{' '}
        <Ts ts={entry.from} /> <span aria-hidden="true">→</span>
        <span className="sr-only"> to </span> <Ts ts={entry.to} />
      </h3>
      <p className="panel-summary">
        {entry.aiSummary ?? entry.ruleSummary} <span className="source-label mono">{entry.aiSummary ? 'AI summary' : 'auto summary'}</span>
      </p>
      <div className="controls">
        {lead}
        <div className="nav-slot" ref={slot}>
          <nav className="diff-nav" aria-label="Previous and next change" data-stuck={stuck || undefined}>
            <button type="button" className="btn" aria-disabled={index === 0} onClick={() => index > 0 && onSelect(index - 1)}>
              <span aria-hidden="true">‹ </span>Previous
            </button>
            {/* Quiet while Play steps, so the time-lapse does not chatter. */}
            <span className="mono" aria-live={quiet ? 'off' : 'polite'}>
              <span aria-hidden="true">
                {index + 1} / {count}
              </span>
              <span className="sr-only">{said.text}</span>
            </span>
            <button type="button" className="btn" aria-disabled={index === count - 1} onClick={() => index < count - 1 && onSelect(index + 1)}>
              Next<span aria-hidden="true"> ›</span>
            </button>
          </nav>
        </div>
        {tools}
        <details className="fold change-details">
          <summary>Change details</summary>
          <p className="panel-stats mono">{statsLine(entry.record)}</p>
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
        </details>
      </div>
    </section>
  );
}

/** "title changed; headings: 4 added, 3 removed, 1 renamed": what the folded Structure list holds. */
function structureCounts({ diff, record: r }: TimelineEntry): string {
  const n = [[r.headingsAdded.length, 'added'], [r.headingsRemoved.length, 'removed'], [r.headingsRenamed?.length ?? 0, 'renamed']] as const;
  const headings = n.filter(([k]) => k > 0).map(([k, w]) => `${k} ${w}`).join(', ');
  return [diff.titleChanged && 'title changed', headings && `headings: ${headings}`].filter(Boolean).join('; ');
}

/** The selected change's text, marked up like a proofreader's galley: Structure and Key (folded), then the diff. */
export function DiffView({ entry, from, to }: Pick<Props, 'entry' | 'from' | 'to'>) {
  const pair = `${entry.from}-${entry.to}`;
  const rows = useMemo(() => collapseUnchanged(entry.diff.ops), [entry]);
  const r = entry.record;
  const structure: [string, string][] = [
    ...(entry.diff.titleChanged ? [['modified', `Title “${from.title}” became “${to.title}”`] as [string, string]] : []),
    ...r.headingsRemoved.map((h): [string, string] => ['removed', `Removed heading “${h}”`]),
    ...r.headingsAdded.map((h): [string, string] => ['added', `Added heading “${h}”`]),
    ...(r.headingsRenamed ?? []).map(([x, y]): [string, string] => ['modified', `Renamed heading “${x}” to “${y}”`]),
  ];

  return (
    <section className="diff-panel" id="diff" tabIndex={-1} aria-labelledby="diff-heading" data-region="text">
      <h3 id="diff-heading">
        What the text says, <Ts ts={entry.from} /> <span aria-hidden="true">→</span>
        <span className="sr-only"> to </span> <Ts ts={entry.to} />
      </h3>
      {structure.length > 0 && (
        <details className="fold">
          <summary>Structure · {structureCounts(entry)}</summary>
          <ul className="diff-structure">
            {structure.map(([op, text]) => (
              <li key={text} data-op={op}>
                {text}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="fold">
        <summary>Key</summary>
        <p className="diff-legend">
          <span><b aria-hidden="true" data-op="added">+</b> added, <span className="w-ins">underlined</span></span>
          <span><b aria-hidden="true" data-op="removed">−</b> removed, <span className="w-del">struck through</span></span>
          <span><b aria-hidden="true" data-op="modified">~</b> changed</span>
          <span><b aria-hidden="true" data-op="moved">↕</b> moved</span>
        </p>
      </details>
      <div className="diff-body" key={pair}>
        {rows.map((row, i) =>
          'gap' in row ? <Gap key={i} ops={row.gap} b={to.blocks} /> : <DiffBlock key={i} op={row.op} a={from.blocks} b={to.blocks} />,
        )}
      </div>
    </section>
  );
}
