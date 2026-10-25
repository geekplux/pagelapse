import { useId } from 'react';

/**
 * Logo A, "Sun path" (docs/redesign/target/V1System.html): a rounded square in a night-to-dusk gradient, five sun
 * dots arcing from dawn cyan to dusk amber, and a horizon line. Shared with public/favicon.svg (logo.test.ts keeps
 * them equal). Logos are exempt from the UI colour rules, so these are literal colours.
 */
export const LOGO = {
  gradient: [
    ['0', '#0d3c48'],
    ['.7', '#2d3a3c'],
    ['1', '#5a3a1e'],
  ],
  tile: { x: 1, y: 1, width: 22, height: 22, rx: 5.5 },
  suns: [
    { cx: 5.4, cy: 16.2, r: 1.25, fill: '#3db9cf' },
    { cx: 7.6, cy: 10.9, r: 1.5, fill: '#7dcedc' },
    { cx: 12, cy: 8.2, r: 1.8, fill: '#f3d673' },
    { cx: 16.4, cy: 10.9, r: 2.1, fill: '#ffc53d' },
    { cx: 18.6, cy: 16.2, r: 2.45, fill: '#ff9d2e' },
  ],
  horizon: { d: 'M1 18.6h22', stroke: '#fefdfb', strokeWidth: 1, opacity: 0.9 },
  /** Kept as drawn on the board (it paints nothing: no fill, no stroke). */
  edge: { d: 'M1 18.6h22V17.5a5.5 5.5 0 0 1 0 0', fill: 'none' },
  ground: { x: 1, y: 18.6, width: 22, height: 4.4, fill: '#21201c', opacity: 0.55, clipPath: 'inset(0 round 0 0 5.5 5.5)' },
} as const;

/** The Pagelapse mark. Decorative by default (pair it with the wordmark); pass `title` to name it. */
export function Logo({ size = 28, title }: { size?: number; title?: string }) {
  const id = `logo-sky-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {LOGO.gradient.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <rect {...LOGO.tile} fill={`url(#${id})`} />
      {LOGO.suns.map((s) => (
        <circle key={s.cx} {...s} />
      ))}
      <path {...LOGO.horizon} />
      <path {...LOGO.edge} />
      <rect {...LOGO.ground} />
    </svg>
  );
}
