import { MODES, type Mode } from './visualState.ts';

/** The compare modes as native radios, styled as a segmented control (arrow keys move between them natively). */
export function ModePicker({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <fieldset className="vp-modes">
      <legend className="sr-only">Compare</legend>
      {MODES.map(([m, label]) => (
        <label key={m} className="vp-mode">
          <input type="radio" name="vp-mode" value={m} checked={mode === m} onChange={() => onMode(m)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
