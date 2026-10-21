import { Fragment } from 'react';
import type { WordOp } from '../../core/types.ts';

/**
 * Word edits of a reworded block: `<ins>` underlined, `<del>` struck through; trailing spaces stay unmarked.
 * A `<del>` directly followed by an `<ins>` gets a real space, so copied text does not glue the two words together.
 */
export function WordDiff({ words }: { words: readonly WordOp[] }) {
  return words.map((w, i) => {
    const text = w.text.trimEnd();
    if (w.type === 'equal' || !text) return w.text;
    const Mark = w.type;
    const glued = w.type === 'del' && text === w.text && words[i + 1]?.type === 'ins';
    return (
      <Fragment key={i}>
        <Mark>{text}</Mark>
        {glued ? ' ' : w.text.slice(text.length)}
      </Fragment>
    );
  });
}
