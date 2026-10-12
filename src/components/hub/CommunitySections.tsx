import Link from 'next/link';
import { CommentActions } from '@/components/interactive/CommentActions';
import { DateTime, PlainText, VerifiedBadge } from '@/components/ui';
import { igdbImageUrl, apiDownloadUrl, paths } from '@/lib/urls';
import type { PublicComment, PublicVersion, Screenshot } from '@/server/public/types';
import { initial } from './variant';
import './hub.css';

/** "1.2 MB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Release notes cut for summaries (full text on the versions page). */
const clip = (s: string, max = 280) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** The latest versions with notes, date, check state and download (full list on the versions page). */
export function VersionSummary({
  handlerId,
  versions,
  currentVersion,
  versionsHref,
  limit = 4,
}: {
  handlerId: string;
  versions: PublicVersion[];
  currentVersion: number;
  versionsHref: string;
  limit?: number;
}) {
  const shown = versions.slice(0, limit);
  return (
    <>
      <ol className="hub-history">
        {shown.map((v) => (
          <li key={v.id}>
            <span className="ver">
              v{v.version}
              {v.version === currentVersion && <small>Current</small>}
            </span>
            <div>
              <p>
                {v.releaseNotes ? clip(v.releaseNotes) : v.version === 1 ? 'First release.' : 'No notes.'}
              </p>
              <div className="meta">
                <DateTime value={v.createdAt} />
                <VerifiedBadge verified={v.verified} />
                <a href={apiDownloadUrl(handlerId, v.version)} rel="nofollow">
                  Download ({formatBytes(v.sizeBytes)})
                </a>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {versions.length > 0 && (
        <p className="small mt-5 mb-0">
          <Link href={versionsHref} className="text-ink-2">
            {versions.length > shown.length
              ? `All ${versions.length} versions, with files and scripts`
              : 'Version details, files and scripts'}
          </Link>
        </p>
      )}
    </>
  );
}

function CommentItem({ c, replies }: { c: PublicComment; replies?: PublicComment[] }) {
  return (
    <li className="hub-comment" id={`comment-${c.id}`}>
      <span className="hub-avatar" aria-hidden="true">
        {initial(c.authorName)}
      </span>
      <div className="min-w-0">
        <div className="who">
          <b>{c.authorId ? <Link href={paths.author(c.authorName)}>{c.authorName}</Link> : c.authorName}</b>
          <DateTime value={c.createdAt} format="relative" />
          {c.editedAt && <span className="micro faint">edited</span>}
        </div>
        <PlainText text={c.body} className="text" />
        <CommentActions commentId={c.id} authorId={c.authorId} />
        {replies && replies.length > 0 && (
          <ul className="hub-replies">
            {replies.map((r) => (
              <CommentItem key={r.id} c={r} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/**
 * Comments, threaded: roots newest first, each with its replies oldest first. A reply whose root is not
 * on this page (older page, or gone) shows as a root.
 */
export function CommentList({ comments }: { comments: PublicComment[] }) {
  const ids = new Set(comments.map((c) => c.id));
  const roots = comments.filter((c) => !c.parentId || !ids.has(c.parentId));
  const replies = new Map<string, PublicComment[]>();
  for (const c of comments) {
    if (c.parentId && ids.has(c.parentId)) {
      const list = replies.get(c.parentId) ?? [];
      list.unshift(c); // input is newest first: unshift keeps replies oldest first
      replies.set(c.parentId, list);
    }
  }
  return (
    <ul className="hub-comments">
      {roots.map((c) => (
        <CommentItem key={c.id} c={c} replies={replies.get(c.id)} />
      ))}
    </ul>
  );
}

/** IGDB screenshots: thumbnails linking to the large image. */
export function Screenshots({ gameName, shots }: { gameName: string; shots: Screenshot[] }) {
  return (
    <ul className="hub-shots">
      {shots.slice(0, 8).map((s, i) => (
        <li key={s.imageId}>
          <a href={igdbImageUrl(s.imageId, 't_1080p')} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- IGDB images as is (unoptimized) */}
            <img
              src={igdbImageUrl(s.imageId, 't_screenshot_med')}
              alt={`${gameName} screenshot ${i + 1}`}
              width={569}
              height={320}
              loading="lazy"
              decoding="async"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
