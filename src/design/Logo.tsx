/**
 * Geometry shared with public/favicon.svg: an ink tile holding two page outlines (the back one,
 * offset up-left, is an earlier capture) and, on the front page, a before/after divider with a
 * round handle. Dashed text lines sit before the divider, solid ones after it, so the mark reads
 * in monochrome; colour only adds the removed/added hues.
 */
export const LOGO_GEOMETRY = {
  back: { x: 4, y: 3.25, width: 13, height: 14.5, rx: 1.5 },
  front: { x: 7, y: 6.25, width: 13, height: 14.5, rx: 1.5 },
  divider: 'M13.5 6.25v14.5',
  before: 'M8.75 9.75h1.25M11 9.75h1M8.75 17.25h1.25M11 17.25h1',
  after: 'M14.75 9.75h3.75M14.75 17.25h2.5',
  handle: { cx: 13.5, cy: 13.5, r: 1.75 },
} as const;

/**
 * The Pagelapse mark. Decorative by default (pair it with the wordmark); pass `title` to name it.
 * public/favicon.svg is the monochrome variant (every stroke in the tile's paper colour).
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
      <g strokeWidth="1.5" strokeLinecap="round">
        <rect className="logo-page" {...LOGO_GEOMETRY.back} />
        <rect className="logo-page" {...LOGO_GEOMETRY.front} />
        <path className="logo-line" d={LOGO_GEOMETRY.divider} />
      </g>
      <g fill="none" strokeWidth="1.25">
        <path className="logo-minus" d={LOGO_GEOMETRY.before} />
        <path className="logo-plus" d={LOGO_GEOMETRY.after} />
      </g>
      <circle className="logo-handle" {...LOGO_GEOMETRY.handle} />
    </svg>
  );
}
