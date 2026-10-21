import { Fragment } from 'react';
import type { WordOp } from '../../core/types.ts';

/** Word edits of a reworded block: `<ins>` underlined, `<del>` struck through; trailing spaces stay unmarked. */
export function WordDiff({ words }: { words: readonly WordOp[] }) {
  return words.map((w, i) => {
    const text = w.text.trimEnd();
    if (w.type === 'equal' || !text) return w.text;
    const Mark = w.type;
    return (
      <Fragment key={i}>
        <Mark>{text}</Mark>
        {w.text.slice(text.length)}
      </Fragment>
    );
  });
}
