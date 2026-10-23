import { useState } from 'react';
import type { Block, BlockOp } from '../../core/types.ts';
import { WordDiff } from './WordDiff.tsx';

/** Blocks longer than this (over 12 lines at the 72ch measure) are clamped behind "Show full block". */
export const CLAMP_CHARS = 900;
/** Visually hidden, spoken before each changed block; the gutter symbol (+ − ~ ↕) is drawn by CSS. */
export const PREFIX: Record<BlockOp['type'], string> = { equal: '', added: 'Added: ', removed: 'Removed: ', modified: 'Changed: ', moved: 'Moved: ' };

interface Props {
  op: BlockOp;
  /** Blocks of the earlier and the later capture. */
  a: readonly Block[];
  b: readonly Block[];
}

/** One block of the diff: kind-appropriate element, hidden prefix, tint and text style by `data-op`. */
export function DiffBlock({ op, a, b }: Props) {
  const [full, setFull] = useState(false);
  const block = op.type === 'added' ? op.block : op.type === 'removed' ? a[op.a] : b[op.b];
  if (!block) return null;
  const kind = op.type === 'modified' ? op.kind : block.kind;
  const length = op.type === 'modified' ? op.words.reduce((n, w) => n + w.text.length, 0) : block.text.length;
  const long = length > CLAMP_CHARS;
  const Tag = kind === 'quote' ? 'blockquote' : kind === 'code' ? 'pre' : 'p';
  return (
    <div className="db" data-op={op.type} data-kind={kind}>
      <Tag className={long && !full ? 'db-t is-clamped' : 'db-t'}>
        {PREFIX[op.type] && <span className="sr-only">{PREFIX[op.type]}</span>}
        {op.type === 'modified' ? <WordDiff words={op.words} /> : block.text}
      </Tag>
      {long && (
        <button type="button" className="btn-link" aria-expanded={full} onClick={() => setFull(!full)}>
          {full ? 'Show less' : 'Show full block'}
        </button>
      )}
    </div>
  );
}
