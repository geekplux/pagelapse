import { type Ref, useEffect, useState } from 'react';

/** Seconds of silence after which the status line says the Archive is slow (it can take ~30 s when it is down). */
const SLOW_S = 8;

interface Props {
  /** A run that is fetching (Cancel), or one that was stopped (`stopped` says how far it got; Start again). */
  running: boolean;
  /** The line shows. A finished or failed run keeps it laid out but hidden, holding the meta line's height. */
  shown: boolean;
  /** Captures read so far, and in all (0 until the capture list arrives). */
  progress: readonly [number, number];
  /** A stopped run's line: `Stopped after 6 of 14 captures.` */
  stopped?: string | undefined;
  onCancel: () => void;
  onRetry?: (() => void) | undefined;
  /** The status text, which takes focus when the button it had goes away (it is focusable from script only). */
  textRef?: Ref<HTMLSpanElement> | undefined;
}

/**
 * A live run's status, in the meta line's place (target/V1Live.html): what it is doing, `n of N` and a 2 px bar, and
 * Cancel; once stopped, how far it got and Start again. Screen readers hear the run through the polite live region.
 */
export function LoadingStatus({ running, shown, progress: [done, total], stopped, onCancel, onRetry, textRef }: Props) {
  // The count that has been showing for SLOW_S seconds while running: a new count resets the wait.
  const [stuck, setStuck] = useState(-1);
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setStuck(done), SLOW_S * 1000);
    return () => clearTimeout(t);
  }, [done, running]);
  const live = shown && (running || !!onRetry);
  const text = stopped && shown ? stopped : running && stuck === done ? 'The Internet Archive is slow right now' : 'Reading captures from the Internet Archive';
  return (
    <div className="live-status" data-running={running || undefined} aria-hidden={!shown || undefined}>
      <span className="live-text" tabIndex={shown ? -1 : undefined} ref={shown ? textRef : undefined}>
        {text}
      </span>
      {!(stopped && shown) && (
        <>
          {/* Laid out before the capture list arrives too, so the line does not wrap anew when it does. */}
          <span className="live-count mono" data-empty={!total || undefined}>
            <b className="num">{done}</b> of {total}
          </span>
          {/* The count says the same, so the bar is not announced. */}
          <span className="live-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${total ? done / total : 0})` }} />
          </span>
        </>
      )}
      {live ? (
        <button type="button" className="btn-link live-act" onClick={running ? onCancel : onRetry}>
          {running ? 'Cancel' : 'Start again'}
        </button>
      ) : (
        // The hidden line's place holder for the button (a button would stay focusable, hidden).
        <span className="btn-link live-act">Cancel</span>
      )}
    </div>
  );
}
