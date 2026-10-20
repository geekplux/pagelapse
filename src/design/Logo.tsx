/** Geometry shared with public/favicon.svg: an ink tile, a rewind arc and a ± (added over removed). */
export const LOGO_PATHS = {
  arc: 'M5.42 9.61A7 7 0 1 0 10.78 5.11M12.93 6.77 10.39 5.18 12.24 2.81',
  plus: 'M9.9 11h4.2M12 8.9v4.2',
  minus: 'M9.9 15.4h4.2',
} as const;

/**
 * The wayback-diff mark. Decorative by default (pair it with the wordmark); pass `title` to name it.
 * public/favicon.svg is the monochrome variant (± in the tile's paper colour).
 */
export function Logo({ size = 28, title }: { size?: number; title?: string }) {
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
      <rect className="logo-tile" width="24" height="24" rx="5.5" />
      <g fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path className="logo-arc" d={LOGO_PATHS.arc} />
        <path className="logo-plus" d={LOGO_PATHS.plus} strokeWidth="1.7" />
        <path className="logo-minus" d={LOGO_PATHS.minus} strokeWidth="1.7" />
      </g>
    </svg>
  );
}
