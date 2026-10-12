import { Badge } from '@/components/ui';
import type { HandlerState } from '@/server/public';

const LOOK: Record<
  HandlerState,
  { tone: 'neutral' | 'ok' | 'warn' | 'danger'; label: string; hint: string }
> = {
  draft: { tone: 'neutral', label: 'Draft', hint: 'No version yet: upload one to publish.' },
  private: { tone: 'neutral', label: 'Private', hint: 'Only you and moderators see it.' },
  awaiting_approval: {
    tone: 'warn',
    label: 'Awaiting approval',
    hint: 'Public, waiting for a moderator before it is listed on the hub.',
  },
  listed: { tone: 'ok', label: 'Listed', hint: 'On the hub and in the app.' },
  deleted: { tone: 'danger', label: 'Deleted', hint: 'Removed from the hub.' },
};

/** Author-facing state of a handler (section 2.3), words first. */
export function StateBadge({ state, withHint }: { state: HandlerState; withHint?: boolean }) {
  const look = LOOK[state];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge
        tone={look.tone}
        icon={state === 'listed' ? 'check' : state === 'awaiting_approval' ? 'clock' : undefined}
      >
        {look.label}
      </Badge>
      {withHint && <span className="small muted">{look.hint}</span>}
    </span>
  );
}

export const stateHint = (state: HandlerState) => LOOK[state].hint;
