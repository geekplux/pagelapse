import { Logo } from './Logo.tsx';

/** The mark and the name, "Pagelapse" in 20/700 (the name is real text, so it is also the accessible name). */
export function Wordmark() {
  return (
    <span className="wordmark">
      <Logo size={28} />
      <span className="wm-text">Pagelapse</span>
    </span>
  );
}
