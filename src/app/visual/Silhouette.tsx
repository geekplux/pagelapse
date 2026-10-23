import { useMemo } from 'react';
import { silhouette } from '../../core/silhouette.ts';
import type { ExtractedPage } from '../../core/types.ts';

/** A capture's text outline (title, headings, paragraph bars), drawn locally: no image or frame request. Decorative. */
export function Silhouette({ page }: { page: Pick<ExtractedPage, 'title' | 'blocks'> }) {
  const bars = useMemo(() => silhouette(page), [page]);
  return (
    <svg className="sil" viewBox="0 0 320 200" preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false">
      {bars.map((b, i) => (
        <rect key={i} data-kind={b.kind} x={b.x} y={b.y} width={b.w} height={b.h} rx={1} />
      ))}
    </svg>
  );
}
