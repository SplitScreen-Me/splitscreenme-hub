'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActionState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { toggleStarAction, type StarState } from '@/server/actions/community';

/**
 * Stars a handler for the signed-in viewer and shows the count. A plain form underneath, so it works
 * without JavaScript; anonymous viewers are sent to the login page.
 */
export function StarButton({
  handlerId,
  starred,
  count,
}: {
  handlerId: string;
  starred: boolean;
  count: number;
}) {
  const pathname = usePathname();
  const [state, action, pending] = useActionState<StarState, FormData>(
    toggleStarAction.bind(null, handlerId),
    {
      starred,
      count,
    },
  );
  const label = state.starred ? 'Unstar this handler' : 'Star this handler';
  if (state.needsLogin) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="chip"
        title="Log in to star handlers"
      >
        <Icon name="star" />
        <span className="count">{state.count}</span>
        <span className="sr-only">Log in to star this handler</span>
      </Link>
    );
  }
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="star" value={state.starred ? '0' : '1'} />
      <input type="hidden" name="path" value={pathname} />
      <button
        type="submit"
        className={cn('chip', state.starred && 'text-ink')}
        aria-pressed={state.starred}
        aria-label={`${label} (${state.count} stars)`}
        title={state.error ?? label}
        disabled={pending}
      >
        <Icon name="star" className={cn(state.starred && '[&_path]:fill-current')} />
        <span className="count">{state.count}</span>
      </button>
    </form>
  );
}
