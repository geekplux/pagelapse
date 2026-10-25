import { type CSSProperties, useState } from 'react';

interface Props {
  src: string;
  thumb: string;
  alt: string;
  onError: () => void;
  className?: string;
}

/**
 * A recorded picture in its 16:10 box. Its thumbnail stands in, scaled up, until the full picture has decoded. When
 * the picture changes, the new one fades in over the previous one in 250 ms (CSS; none under reduced motion).
 */
export function Shot({ src, thumb, alt, onError, className = '' }: Props) {
  const [seen, setSeen] = useState({ src, prev: '' });
  if (seen.src !== src) setSeen({ src, prev: seen.src });
  const prev = seen.src === src ? seen.prev : seen.src;
  return (
    <div className={`vp-frame ${className}`} data-fade={prev ? '' : undefined} style={prev ? ({ '--prev': `url(${prev})` } as CSSProperties) : undefined}>
      <img
        key={src}
        className="vp-shot"
        src={src}
        width={960}
        height={600}
        alt={alt}
        decoding="async"
        fetchPriority="high"
        style={{ backgroundImage: `url(${thumb})` }}
        onError={onError}
      />
    </div>
  );
}
