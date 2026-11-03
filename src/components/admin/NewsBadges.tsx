import { Badge } from '@/components/ui';
import type { NewsSeverityName, NewsStatus } from '@/lib/news';

const STATUS: Record<
  NewsStatus,
  { tone: 'neutral' | 'ok'; label: string; icon?: 'check' | 'clock'; hint: string }
> = {
  live: { tone: 'ok', label: 'Live', icon: 'check', hint: 'Shown in the app now.' },
  scheduled: { tone: 'neutral', label: 'Scheduled', icon: 'clock', hint: 'Shown from its start date.' },
  expired: { tone: 'neutral', label: 'Expired', hint: 'Its end date has passed: no longer shown.' },
  draft: { tone: 'neutral', label: 'Draft', hint: 'Not published: never shown.' },
};

/** Where an announcement stands for the app, words first. */
export function NewsStatusBadge({ status, withHint }: { status: NewsStatus; withHint?: boolean }) {
  const look = STATUS[status];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={look.tone} icon={look.icon} className={status === 'expired' ? 'opacity-70' : undefined}>
        {look.label}
      </Badge>
      {withHint && <span className="small muted">{look.hint}</span>}
    </span>
  );
}

const SEVERITY: Record<NewsSeverityName, { tone: 'neutral' | 'warn' | 'danger'; label: string }> = {
  info: { tone: 'neutral', label: 'Info' },
  warning: { tone: 'warn', label: 'Warning' },
  critical: { tone: 'danger', label: 'Critical' },
};

export function SeverityBadge({ severity }: { severity: NewsSeverityName }) {
  const look = SEVERITY[severity];
  return (
    <Badge tone={look.tone} icon={severity === 'info' ? 'info' : 'warning'}>
      {look.label}
    </Badge>
  );
}
