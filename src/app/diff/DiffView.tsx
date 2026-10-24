import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { Block, BlockOp, SnapshotPage, TimelineEntry } from '../../core/types.ts';
import { useMedia } from '../useMedia.ts';
import { DiffBlock } from './DiffBlock.tsx';
import { type EqualOp, FIRST_CHANGES, type Row, collapseUnchanged, firstChanges, unchangedLabel } from './rows.ts';

interface Props {
  entry: TimelineEntry;
  /** The earlier and the later capture of `entry`. */
  from: SnapshotPage;
  to: SnapshotPage;
}

/** Blocks revealed by a button: a named group that takes focus when it opens, so the keyboard lands on them. */
function Revealed({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    // A named group, not a <fieldset>: these are revealed text blocks, not form controls.
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div className="db-open" role="group" aria-label={label} tabIndex={-1} ref={ref}>
      {children}
    </div>
  );
}

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A collapsed run of unchanged blocks; expanding it moves focus to the revealed blocks. */
function Gap({ ops, b }: { ops: EqualOp[]; b: readonly Block[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="db-gap" onClick={() => setOpen(true)}>
        <Chevron />
        {unchangedLabel(ops.length)}
      </button>
    );
  }
  return (
    <Revealed label={`${ops.length} unchanged blocks`}>
      {ops.map((op) => (
        <DiffBlock key={op.b} op={op} a={[]} b={b} />
      ))}
    </Revealed>
  );
}

const key = (op: BlockOp) => `${op.type}${'a' in op ? op.a : ''}:${'b' in op ? op.b : ''}`;

/** Rows of the diff: blocks, and collapsed runs of unchanged blocks. */
function Rows({ rows, from, to }: { rows: readonly Row[]; from: SnapshotPage; to: SnapshotPage }) {
  return rows.map((row) => ('gap' in row ? <Gap key={`g${row.gap[0]!.b}`} ops={row.gap} b={to.blocks} /> : <DiffBlock key={key(row.op)} op={row.op} a={from.blocks} b={to.blocks} />));
}

/**
 * The selected change's text, marked up like a proofreader's galley: + − ~ hang in the margin, added blocks sit on
 * amber, removed ones on cyan, words are underlined or struck through. A long diff shows its first changes, then
 * "Show n more changes".
 */
export function DiffView({ entry, from, to }: Props) {
  const rows = useMemo(() => collapseUnchanged(entry.diff.ops), [entry]);
  // Phones show half as many first (target/V3WorkPhone.html).
  const phone = useMedia('(max-width: 39.99rem)');
  const { cut, more } = useMemo(() => firstChanges(rows, phone ? FIRST_CHANGES / 2 : FIRST_CHANGES), [rows, phone]);
  const [all, setAll] = useState(false);
  return (
    <div className="cs-diff">
      <h4 className="sr-only">Text changes</h4>
      <div className="diff-body">
        <Rows rows={rows.slice(0, cut)} from={from} to={to} />
        {more > 0 &&
          (all ? (
            <Revealed label={`${more} more changes`}>
              <Rows rows={rows.slice(cut)} from={from} to={to} />
            </Revealed>
          ) : (
            <p className="db-more">
              <button type="button" className="btn" onClick={() => setAll(true)}>
                Show {more} more {more === 1 ? 'change' : 'changes'}
              </button>
            </p>
          ))}
      </div>
    </div>
  );
}
