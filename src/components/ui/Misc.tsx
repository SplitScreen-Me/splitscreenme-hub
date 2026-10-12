import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

/** Big number + label, condensed tabular figures. */
export function Stat({
  value,
  label,
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('stat', className)}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/** Keyboard key. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

export function EmptyState({
  icon = 'search',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <p className="h3 text-ink">{title}</p>
      {children && <div className="small max-w-prose">{children}</div>}
      {action}
    </div>
  );
}

/** Scrollable bordered table. Use `.num` on numeric cells. */
export function Table({ className, children, ...rest }: ComponentProps<'table'>) {
  return (
    <div className="table-wrap">
      <table className={cn('table', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

/** Plain code block (user content, scripts). Docs code is highlighted at build time by shiki instead. */
export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  return (
    <pre className={cn('codeblock', className)} aria-label={label} tabIndex={0}>
      <code>{code}</code>
    </pre>
  );
}

const fmtDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const fmtDateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relativeTime(date: Date, now: Date = new Date()): string {
  const s = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
  return rtf.format(Math.round(s / (86400 * 365)), 'year');
}

/** `<time>` with a machine date; dates are formatted in UTC so server output is stable. */
export function DateTime({
  value,
  format = 'date',
  className,
}: {
  value: Date | string;
  format?: 'date' | 'datetime' | 'relative';
  className?: string;
}) {
  const d = typeof value === 'string' ? new Date(value) : value;
  const text =
    format === 'relative' ? relativeTime(d) : (format === 'datetime' ? fmtDateTime : fmtDate).format(d);
  return (
    <time dateTime={d.toISOString()} title={fmtDateTime.format(d)} className={className}>
      {text}
    </time>
  );
}

/** 1.2k, 3.4M: the mockup's compact counters. */
export function formatCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}
