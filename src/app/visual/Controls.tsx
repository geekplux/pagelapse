import { type ReactNode, useEffect, useRef, useState } from 'react';
import { formatTimestampLong } from '../../core/timestamp.ts';
import type { TimelineEntry } from '../../core/types.ts';

const Chevron = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface StepProps {
  entry: TimelineEntry;
  index: number;
  count: number;
  onSelect: (i: number) => void;
  /** Which capture the pane shows, for the live region (`Before, 6 November 2013`). */
  showing?: string | undefined;
  /** Quiet while Play steps, so the time-lapse does not chatter. */
  quiet?: boolean | undefined;
  /** The decade compare's two ends (`first`, `latest`), when it is the pair shown. */
  overview?: readonly [string, string] | undefined;
}

/**
 * Previous / next change around `Change n of N`. Its live region says which change and capture are shown; it is kept
 * until the change, its place or the shown capture changes, so a live run's growing total does not re-announce it. On
 * phones it sticks to the bottom of the screen once its row has scrolled away above.
 */
export function StepNav({ entry, index, count, onSelect, showing, quiet, overview }: StepProps) {
  const key = `${entry.from}-${entry.to} ${index} ${showing ?? ''} ${overview ?? ''}`;
  const [said, setSaid] = useState({ key: '', text: '' });
  if (said.key !== key) {
    const dates = `${formatTimestampLong(entry.from)} to ${formatTimestampLong(entry.to)}`;
    const text = overview ? `${overview[0].charAt(0).toUpperCase()}${overview[0].slice(1)} capture to ${overview[1]}: ${dates}, across all ${count} changes` : `Change ${index + 1} of ${count}: ${dates}, ${entry.significance.magnitude}`;
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

  const first = !overview && index === 0;
  const last = !!overview || index === count - 1;
  return (
    <div className="nav-slot" ref={slot}>
      <nav className="diff-nav" aria-label="Previous and next change" data-stuck={stuck || undefined}>
        {/* From the decade compare, Previous narrows to the selected (latest) change; there is nothing after it. */}
        <button type="button" className="btn btn-icon" aria-label="Previous change" aria-disabled={first} onClick={() => (overview ? onSelect(index) : index > 0 && onSelect(index - 1))}>
          <Chevron d="M10 3.5 5.5 8l4.5 4.5" />
        </button>
        <span className="step-label" aria-live={quiet ? 'off' : 'polite'}>
          <span aria-hidden="true">
            {overview ? (
              'First and latest'
            ) : (
              <>
                Change <span className="num">{index + 1}</span> of <span className="num">{count}</span>
              </>
            )}
          </span>
          <span className="sr-only">{said.text}</span>
        </span>
        <button type="button" className="btn btn-icon" aria-label="Next change" aria-disabled={last} onClick={() => !last && onSelect(index + 1)}>
          <Chevron d="M6 3.5 10.5 8 6 12.5" />
        </button>
      </nav>
    </div>
  );
}

/** Copies the address bar (the shareable link) and says so politely; the confirmation clears when the view changes. */
function CopyLink({ view }: { view: string }) {
  const [copied, setCopied] = useState({ view: '', text: '' });
  // Clear first, then set on the next frame, so pressing again re-announces the same text.
  const announce = (text: string) => {
    setCopied({ view: '', text: '' });
    requestAnimationFrame(() => setCopied({ view, text }));
  };
  const copy = () =>
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(location.href))
      .then(
        () => announce('Link copied'),
        () => announce('Could not copy: the link is in the address bar'),
      );
  return (
    <>
      <button type="button" className="btn btn-quiet vp-copy" onClick={copy}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.7.7M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.7-.7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="vp-copy-text">Copy link</span>
      </button>
      {/* An explicit status role is the most widely announced live region; <output> support varies. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <span className="sr-only" role="status">
        {copied.view === view ? copied.text : ''}
      </span>
    </>
  );
}

/** Play / Pause as a line button: a drawn triangle or bars, the word, and "time-lapse" for screen readers. */
export function PlayButton({ playing, toggle }: { playing: boolean; toggle: () => void }) {
  return (
    <button type="button" className="btn vp-play" data-play data-playing={playing || undefined} onClick={toggle}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        {playing ? <path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" /> : <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" />}
      </svg>
      {playing ? 'Pause' : 'Play'}
      <span className="sr-only"> time-lapse</span>
    </button>
  );
}

/**
 * The row under the stage: Play and Previous / Next on the left; the compare control (and Single's Before / After)
 * and Copy link on the right, flush with the stage's edge. `view` names the shown view, so a copy confirmation
 * belongs to it.
 */
export function Controls({ play, nav, tools, view }: { play?: ReactNode; nav?: ReactNode; tools: ReactNode; view: string }) {
  return (
    <div className="controls">
      <div className="ctrl-start">
        {play}
        {nav}
      </div>
      <div className="ctrl-end">
        {tools}
        <CopyLink view={view} />
      </div>
    </div>
  );
}
