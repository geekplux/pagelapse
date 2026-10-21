import { Logo } from './Logo.tsx';

/** *page***lapse** over a five-frame time-lapse strip; reads as "Pagelapse" to assistive tech. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <Logo size={40} />
      <span className="wm-text" aria-hidden="true">
        <span className="wm-page">page</span>
        <span className="wm-lapse">
          lapse
          <span className="wm-frames">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </span>
      <span className="sr-only">Pagelapse</span>
    </span>
  );
}
