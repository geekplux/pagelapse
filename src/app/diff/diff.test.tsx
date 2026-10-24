import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Block, BlockOp, SnapshotPage, TimelineEntry } from '../../core/types.ts';
import { CLAMP_CHARS, DiffBlock } from './DiffBlock.tsx';
import { DiffView } from './DiffView.tsx';
import { collapseUnchanged, firstChanges, unchangedLabel } from './rows.ts';

const eq = (n: number): BlockOp => ({ type: 'equal', a: n, b: n });
const add: BlockOp = { type: 'added', b: 0, block: { kind: 'paragraph', text: 'new' } };
const shape = (ops: BlockOp[], min?: number) => collapseUnchanged(ops, min).map((r) => ('gap' in r ? `gap${r.gap.length}` : r.op.type[0]));

describe('collapseUnchanged', () => {
  it('collapses runs of >= 3 unchanged blocks, keeping one block of context next to each change', () => {
    expect(shape([eq(0), eq(1), eq(2), add])).toEqual(['e', 'e', 'e', 'a']);
    expect(shape([eq(0), eq(1), eq(2), eq(3), add])).toEqual(['gap3', 'e', 'a']);
    expect(shape([add, ...[1, 2, 3, 4, 5].map(eq), add])).toEqual(['a', 'e', 'gap3', 'e', 'a']);
    expect(shape([add, eq(1), eq(2), eq(3), eq(4)])).toEqual(['a', 'e', 'gap3']);
    expect(shape([eq(0), eq(1), eq(2)])).toEqual(['gap3']);
  });

  it('keeps short runs and every change in order', () => {
    const ops = [add, eq(1), eq(2), eq(3), add];
    expect(shape(ops)).toEqual(['a', 'e', 'e', 'e', 'a']);
    expect(collapseUnchanged(ops).flatMap((r) => ('gap' in r ? r.gap : [r.op]))).toEqual(ops);
  });

  it('labels a run "Show n unchanged blocks"', () => {
    expect(unchangedLabel(2)).toBe('Show 2 unchanged blocks');
    expect(unchangedLabel(1)).toBe('Show 1 unchanged block');
  });

  it('cuts a long diff after its first changes and the unchanged block after the last of them', () => {
    const rows = collapseUnchanged([add, eq(1), add, add, eq(4), eq(5), eq(6), eq(7), add]);
    expect(firstChanges(rows, 3)).toEqual({ cut: 5, more: 1 });
    expect(firstChanges(rows, 2)).toEqual({ cut: 3, more: 2 });
    expect(firstChanges(rows, 4)).toEqual({ cut: rows.length, more: 0 });
  });
});

describe('DiffBlock', () => {
  const a: Block[] = [{ kind: 'paragraph', text: 'Old words here.' }];
  const b: Block[] = [{ kind: 'quote', text: 'New words here.' }];
  const html = (op: BlockOp) => renderToStaticMarkup(<DiffBlock op={op} a={a} b={b} />);

  it('prefixes changed blocks with hidden text and marks words with ins/del', () => {
    expect(html(add)).toContain('<p class="db-t"><span class="sr-only">Added: </span>new</p>');
    expect(html({ type: 'removed', a: 0 })).toContain('<span class="sr-only">Removed: </span>Old words here.');
    expect(html({ type: 'moved', a: 0, b: 0 })).toContain('<blockquote class="db-t"><span class="sr-only">Moved: </span>New words here.');
    const changed = html({ type: 'modified', a: 0, b: 0, kind: 'quote', normalizedEqual: false, words: [{ type: 'del', text: 'Old ' }, { type: 'ins', text: 'New ' }, { type: 'equal', text: 'words here.' }] });
    expect(changed).toContain('<span class="sr-only">Changed: </span><del>Old</del> <ins>New</ins> words here.');
    expect(html({ type: 'equal', a: 0, b: 0 })).not.toContain('sr-only');
    const glued = html({ type: 'modified', a: 0, b: 0, kind: 'quote', normalizedEqual: false, words: [{ type: 'del', text: 'Old' }, { type: 'ins', text: 'New ' }, { type: 'equal', text: 'words here.' }] });
    expect(glued).toContain('<del>Old</del> <ins>New</ins> words here.');
  });

  it('clamps very long blocks behind "Show full block"', () => {
    const long = (n: number) => html({ type: 'added', b: 0, block: { kind: 'code', text: 'x'.repeat(n) } });
    expect(long(CLAMP_CHARS + 1)).toMatch(/<pre class="db-t is-clamped">.*aria-expanded="false">Show full block</);
    expect(long(CLAMP_CHARS)).not.toContain('Show full block');
  });
});

describe('DiffView', () => {
  const page = (texts: string[]): SnapshotPage => ({ ts: '20200101000000', digest: 'd', title: 't', blocks: texts.map((text) => ({ kind: 'paragraph', text })) });
  const [a, b] = [page(['Kept.', 'Old one.', 'Old two.']), page(['Kept.', 'New one.'])];
  const ops: BlockOp[] = [{ type: 'equal', a: 0, b: 0 }, { type: 'removed', a: 1 }, { type: 'removed', a: 2 }, { type: 'added', b: 1, block: b.blocks[1]! }];
  const html = renderToStaticMarkup(<DiffView entry={{ diff: { ops, titleChanged: false, cutoff: false } } as unknown as TimelineEntry} from={a} to={b} />);

  it('draws a run of removed or added blocks as one band, each block keeping its own spoken prefix', () => {
    expect(html.match(/class="db-run" data-op="\w+"/g)).toEqual(['class="db-run" data-op="removed"', 'class="db-run" data-op="added"']);
    expect(html.match(/<span class="sr-only">(\w+): <\/span>/g)?.length).toBe(3);
    expect(html).not.toContain('Show');
  });
});
