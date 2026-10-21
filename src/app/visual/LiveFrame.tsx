import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  /** The capture in the archive's own viewer. */
  link: string;
  /** Compare modes: the archived page takes no focus or input. */
  inert?: boolean;
}

/**
 * The Internet Archive's own replay of a capture in a sandboxed 1280×800 frame, scaled into the 16:10 mat. Until the
 * frame loads, the capture's text silhouette shows; after 8 s, an honest "still loading" note with a link out.
 */
export function LiveFrame({ ts, page, frames, loaded, onLoad, frame, link, inert = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([e]) => e && el.style.setProperty('--k', String(e.contentRect.width / 1280)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mounted = frames.includes(ts);
  const done = loaded.has(ts);
  const [slow, setSlow] = useState('');
  useEffect(() => {
    if (!mounted || done) return;
    const t = setTimeout(() => setSlow(ts), SLOW_MS);
    return () => clearTimeout(t);
  }, [ts, mounted, done]);
  const state = !mounted ? 'waiting' : done ? 'loaded' : slow === ts ? 'slow' : 'loading';
  return (
    <div className="vp-shot lf" ref={box} data-state={state}>
      {!done && page && <Silhouette page={page} />}
      {!done && (
        <span className="lf-tag mono" aria-hidden="true">
          text outline · {mounted ? 'loading the capture…' : 'waiting'}
        </span>
      )}
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
            inert={inert || hidden}
            aria-hidden={hidden || undefined}
            data-hidden={hidden || undefined}
            data-loaded={loaded.has(f) || undefined}
            onLoad={() => onLoad(f)}
          />
        );
      })}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div className="lf-note" role="status">
        {state === 'slow' && (
          <p>
            <span aria-hidden="true">⧗ </span>Still loading from the Internet Archive. Archived pages can be slow, and some sites block being shown in a
            frame.{' '}
            <a className="cap-out" href={link} target="_blank" rel="noopener noreferrer">
              Open capture<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
