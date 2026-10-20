import type { SampleEntry } from '../samples/index.ts';

interface Props {
  samples: readonly SampleEntry[];
  selectedId: string;
  onSelect: (entry: SampleEntry) => void;
}

/** Built-in samples as a group of toggle buttons; exactly one is pressed. Works for 1..n samples. */
export function SamplePicker({ samples, selectedId, onSelect }: Props) {
  return (
    <fieldset className="picker">
      <legend className="picker-label">Try a sample</legend>
      {samples.map((s) => (
        <button
          key={s.id}
          type="button"
          className="chip"
          aria-pressed={s.id === selectedId}
          onClick={() => onSelect(s)}
        >
          {s.chip}
        </button>
      ))}
    </fieldset>
  );
}
