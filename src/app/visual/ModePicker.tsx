import { useState } from 'react';
import { MODES, type Mode } from './visualState.ts';

/**
 * "Compare: <mode>" opens the compare modes: native radios in a fieldset (arrow keys move between them natively). The
 * button names the current mode; the group stays open until the button closes it, so arrowing through never shuts it.
 */
export function ModePicker({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn vp-compare" aria-expanded={open} aria-controls="vp-modes" onClick={() => setOpen(!open)}>
        Compare: {MODES.find(([m]) => m === mode)![1]}
      </button>
      <fieldset className="vp-modes" id="vp-modes" hidden={!open}>
        <legend className="sr-only">Compare</legend>
        {MODES.map(([m, label]) => (
          <label key={m} className="vp-mode">
            <input type="radio" name="vp-mode" value={m} checked={mode === m} onChange={() => onMode(m)} />
            {label}
          </label>
        ))}
      </fieldset>
    </>
  );
}
