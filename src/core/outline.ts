import type { Block, OutlineNode } from './types.ts';

/**
 * Builds the heading tree of a page from its blocks. A heading nests under the nearest
 * previous heading of a lower level; skipped levels (h1 then h3) still nest.
 */
export function deriveOutline(blocks: readonly Block[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const b of blocks) {
    if (b.kind !== 'heading') continue;
    const node: OutlineNode = { level: b.level ?? 1, text: b.text, children: [] };
    while (stack.length && stack[stack.length - 1]!.level >= node.level) stack.pop();
    (stack[stack.length - 1]?.children ?? roots).push(node);
    stack.push(node);
  }
  return roots;
}
