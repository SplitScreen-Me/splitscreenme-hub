import Link from 'next/link';
import { headers } from 'next/headers';
import { canPost, getCurrentUser } from '@/lib/auth/current-user';
import { paths } from '@/lib/urls';
import { CommentComposer } from './CommentComposer';

/**
 * Posts a comment (or a reply with `parentId`) through a Server Action. Server component: it reads the
 * viewer itself, so render it from a server component (the game and handler pages are). Anonymous
 * viewers get a login link; accounts without a proven address are told what to do.
 */
export async function CommentForm({ handlerId, parentId }: { handlerId: string; parentId?: string }) {
  const [user, h] = await Promise.all([getCurrentUser(), headers()]);
  const path = h.get('x-pathname') ?? '/';
  if (!user) {
    return (
      <p className="small muted">
        <Link href={paths.login(path)} className="underline">
          Log in
        </Link>{' '}
        or{' '}
        <Link href={paths.register()} className="underline">
          create an account
        </Link>{' '}
        to comment.
      </p>
    );
  }
  if (!canPost(user)) {
    return (
      <p className="small muted">
        Confirm your email address or link Discord, GitHub or Google on your{' '}
        <Link href={paths.account()} className="underline">
          account page
        </Link>{' '}
        to comment.
      </p>
    );
  }
  return <CommentComposer handlerId={handlerId} parentId={parentId} path={path} />;
}
