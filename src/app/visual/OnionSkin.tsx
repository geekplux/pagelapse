import { type CSSProperties, type ReactNode, useState } from 'react';

interface Props {
  before: ReactNode;
  after: ReactNode;
}

/** After stacked on Before at an adjustable opacity (native range, step 5); Swap puts Before on top instead. */
export function OnionSkin({ before, after }: Props) {
  const [opacity, setOpacity] = useState(50);
  const [swapped, setSwapped] = useState(false);
  return (
    <>
      <div className="vp-cmp" style={{ '--op': opacity / 100 } as CSSProperties}>
        {swapped ? after : before}
        <div className="vp-top">{swapped ? before : after}</div>
      </div>
      <div className="vp-onion">
        <label>
          {swapped ? 'Before' : 'After'} opacity{' '}
          <input type="range" min={0} max={100} step={5} value={opacity} aria-valuetext={`${opacity}%`} onChange={(e) => setOpacity(e.currentTarget.valueAsNumber)} />
          <output className="mono" aria-hidden="true">
            {opacity}%
          </output>
        </label>
        <button type="button" className="btn" aria-pressed={swapped} onClick={() => setSwapped(!swapped)}>
          <span aria-hidden="true">⇅ </span>Swap
        </button>
      </div>
    </>
  );
}
