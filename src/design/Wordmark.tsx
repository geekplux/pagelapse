import { Logo } from './Logo.tsx';

/** *wayback* ± `diff` over a seismograph baseline; reads as "wayback-diff" to assistive tech. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <Logo size={40} />
      <span className="wm-text" aria-hidden="true">
        <span className="wm-wayback">wayback</span>
        <span className="wm-pm">±</span>
        <span className="wm-diff">diff</span>
        <svg className="wm-ticks" width="100%" height="9" focusable="false">
          <line x1="0" x2="100%" y1="8" y2="8" />
          <line x1="71%" x2="71%" y1="4.5" y2="8" />
          <line x1="80%" x2="80%" y1="0.5" y2="8" />
          <line x1="89%" x2="89%" y1="3" y2="8" />
        </svg>
      </span>
      <span className="sr-only">wayback-diff</span>
    </span>
  );
}
