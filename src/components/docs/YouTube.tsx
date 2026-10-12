'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * Click-to-load video: nothing is requested from YouTube until the reader asks for it, and then only from
 * youtube-nocookie.com (the one frame-src the CSP allows). No thumbnail: third-party images are blocked too.
 */
export function YouTube({ id, title }: { id: string; title: string }) {
  const [on, setOn] = useState(false);
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  return (
    <div className="doc-video not-prose">
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setOn(true)} className="doc-video-play">
          <Icon name="play" />
          <span>
            <b>{title}</b>
            <span className="doc-video-note">Plays from YouTube (youtube-nocookie.com) when you click.</span>
          </span>
        </button>
      )}
    </div>
  );
}
