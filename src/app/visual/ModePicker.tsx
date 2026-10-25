import { MODES, type Mode } from './visualState.ts';

/**
 * The compare modes as a segmented control: native radios in a fieldset (one tab stop; arrow keys move and select).
 * Phones offer Slider and Single; Side by side shows there only while it is the mode a link opened.
 */
export function ModePicker({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <fieldset className="vp-modes" id="vp-modes">
      <legend className="sr-only">Compare</legend>
      {MODES.map(([m, label]) => (
        <label key={m} className="vp-mode" data-mode={m}>
          <input type="radio" name="vp-mode" value={m} checked={mode === m} onChange={() => onMode(m)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
