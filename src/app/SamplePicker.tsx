import type { SampleEntry } from '../samples/index.ts';

interface Props {
  samples: readonly SampleEntry[];
  selectedId: string;
  onSelect: (entry: SampleEntry) => void;
}

/**
 * Built-in samples as quiet text toggles; exactly one is pressed (ink underline and weight). Works for 1..n samples.
 * Phones show the short label; the full one (which contains it) stays the accessible name.
 */
export function SamplePicker({ samples, selectedId, onSelect }: Props) {
  return (
    <fieldset className="picker">
      <legend className="sr-only">Try a sample</legend>
      <span className="picker-label" aria-hidden="true">
        Try
      </span>
      {samples.map((s) => (
        <button key={s.id} type="button" className="chip" data-sample={s.id} aria-pressed={s.id === selectedId} onClick={() => onSelect(s)}>
          <span className="chip-long">{s.chip}</span>
          <span className="chip-short" aria-hidden="true">
            {s.short}
          </span>
        </button>
      ))}
    </fieldset>
  );
}
