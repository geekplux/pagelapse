import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ExtractedPage } from '../../core/types.ts';
import { Silhouette } from './Silhouette.tsx';

/** After this long without a `load`, the pane says the archive is slow (it cannot see why: the frame is cross-origin). */
export const SLOW_MS = 8000;

interface Props {
  /** The capture shown here. */
  ts: string;
  /** Its extracted text, for the silhouette shown until the frame has loaded. */
  page?: ExtractedPage | undefined;
  /** Mounted frames to stack here: `ts` visible, the others preloading, hidden. */
  frames: readonly string[];
  loaded: ReadonlyMap<string, number>;
  onLoad: (ts: string) => void;
  frame: (ts: string) => { src: string; title: string };
  /** `ts` has gone {@link SLOW_MS} without loading (the pane keeps this, and shows one {@link SlowNote}). */
  slow: boolean;
  onSlow: (ts: string) => void;
}

/**
 * The Internet Archive's own replay of a capture in a sandboxed 1280×800 frame, scaled into the 16:10 mat. Until the
 * frame loads, the capture's text silhouette shows; after 8 s, `onSlow` lets the pane show its "still loading" note.
 * The frame is always inert: the pane is a scaled picture of the page, and "Open capture" gives the interactive page.
 */
export function LiveFrame({ ts, page, frames, loaded, onLoad, frame, slow, onSlow }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([e]) => e && el.style.setProperty('--k', String(e.contentRect.width / 1280)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mounted = frames.includes(ts);
  const done = loaded.has(ts);
  useEffect(() => {
    if (!mounted || done || slow) return;
    const t = setTimeout(() => onSlow(ts), SLOW_MS);
    return () => clearTimeout(t);
  }, [ts, mounted, done, slow, onSlow]);
  const state = !mounted ? 'waiting' : done ? 'loaded' : slow ? 'slow' : 'loading';
  return (
    <div className="vp-shot lf" ref={box} data-state={state}>
      <span className="sr-only">{frame(ts).title}</span>
      {!done && page && <Silhouette page={page} />}
      {!done && <span className="lf-tag mono">text outline · {mounted ? 'loading the capture…' : 'waiting'}</span>}
      {frames.map((f) => {
        const hidden = f !== ts;
        const { src, title } = frame(f);
        return (
          <iframe
            key={f}
            src={src}
            title={title}
            sandbox="allow-scripts allow-same-origin"
            allow=""
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            inert
            aria-hidden={hidden || undefined}
            data-hidden={hidden || undefined}
            data-loaded={loaded.has(f) || undefined}
            onLoad={() => onLoad(f)}
          />
        );
      })}
    </div>
  );
}

/**
 * The pane's one "still loading" note, in normal flow below the picture(s): always mounted (an empty live region), so
 * it is announced when a frame stalls, and once however many frames stall. `links` are the stalled captures.
 */
export function SlowNote({ links }: { links: readonly { href: string; label: string }[] }) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div className="lf-note" role="status">
      {links.length > 0 && (
        <p>
          <span aria-hidden="true">◷ </span>Still loading from the Internet Archive. Archived pages can be slow, and some sites block being shown in a frame.
          {links.map((l) => (
            <span key={l.href}>
              {' '}
              <a className="cap-out" href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
