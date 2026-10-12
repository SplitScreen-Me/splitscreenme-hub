import { cn } from '@/lib/cn';
import { igdbCoverUrl, type IgdbSize } from '@/lib/urls';

/**
 * IGDB cover in the 3:4 cover frame. Lazy by default; `priority` for the LCP image (eager, high priority).
 * Without a cover the frame shows the game's initials.
 */
export function CoverImage({
  imageId,
  alt,
  size = 't_cover_big',
  priority,
  className,
}: {
  imageId: string | null | undefined;
  alt: string;
  size?: IgdbSize;
  priority?: boolean;
  className?: string;
}) {
  const src = igdbCoverUrl(imageId, size);
  const [w, h] = size === 't_cover_small' ? [90, 120] : [264, 352];
  return (
    <div className={cn('cover', className)}>
      {src ? (
        // Plain <img>: images are unoptimized (no sharp in the container) and come from IGDB as is.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={w}
          height={h}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
        />
      ) : (
        <span
          className="absolute inset-0 grid place-items-center text-2xl font-extrabold text-ink-3"
          role="img"
          aria-label={alt}
        >
          {initials(alt)}
        </span>
      )}
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
