'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { NEWS_MESSAGE_MAX, normalizeNewsMessage, normalizeNewsUrl, type NewsSeverityName } from '@/lib/news';

/**
 * The app's ticker line, as the Nucleus Co-op app shows an announcement: one line of plain text, the
 * severity as an icon and a tint, "Learn more" when there is a link. Used by the backoffice previews.
 */

const LOOK: Record<NewsSeverityName, { icon: IconName; tone: string; label: string }> = {
  info: { icon: 'info', tone: 'text-ink-2', label: 'Info' },
  warning: { icon: 'warning', tone: 'text-warn', label: 'Warning' },
  critical: { icon: 'warning', tone: 'text-danger', label: 'Critical' },
};

export function TickerLine({
  message,
  url,
  severity,
}: {
  message: string;
  url: string | null;
  severity: NewsSeverityName;
}) {
  const look = LOOK[severity] ?? LOOK.info;
  const link = url ? normalizeNewsUrl(url) : null;
  return (
    <div
      className={cn(
        'flex h-10 min-w-0 items-center gap-2 rounded-ctl bg-pane-2 px-3 small',
        'shadow-[inset_0_0_0_1px_var(--line)]',
        severity === 'warning' && 'shadow-[inset_3px_0_0_var(--warn),inset_0_0_0_1px_var(--line)]',
        severity === 'critical' && 'shadow-[inset_3px_0_0_var(--danger),inset_0_0_0_1px_var(--line)]',
      )}
    >
      <Icon name={look.icon} className={cn('h-4 w-4 shrink-0', look.tone)} label={look.label} />
      <span className={cn('min-w-0 flex-1 truncate', message ? 'text-ink' : 'faint')} title={message}>
        {message || 'Your message'}
      </span>
      {link &&
        (link.ok ? (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-ink underline"
          >
            Learn more
            <Icon name="external" className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="shrink-0 font-semibold text-danger">Learn more (invalid link)</span>
        ))}
    </div>
  );
}

/**
 * Live preview of the enclosing form: follows its `message`, `url` and `severity` fields as the admin
 * types, with the message collapsed to one line as it will be saved.
 */
export function LiveTickerPreview({
  message: initialMessage = '',
  url: initialUrl = '',
  severity: initialSeverity = 'info',
}: {
  message?: string;
  url?: string;
  severity?: NewsSeverityName;
}) {
  const ref = useRef<HTMLElement>(null);
  const [fields, setFields] = useState({
    message: initialMessage,
    url: initialUrl,
    severity: initialSeverity,
  });

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const value = (name: string) => {
      const el = form.elements.namedItem(name);
      return el && 'value' in el ? String(el.value) : '';
    };
    const read = () =>
      setFields({
        message: value('message'),
        url: value('url'),
        severity: (value('severity') || 'info') as NewsSeverityName,
      });
    // After a reset the fields hold their defaults only once the event is done.
    const onReset = () => setTimeout(read, 0);
    form.addEventListener('input', read);
    form.addEventListener('change', read);
    form.addEventListener('reset', onReset);
    return () => {
      form.removeEventListener('input', read);
      form.removeEventListener('change', read);
      form.removeEventListener('reset', onReset);
    };
  }, []);

  const message = normalizeNewsMessage(fields.message);
  const tooLong = message.length > NEWS_MESSAGE_MAX;
  return (
    <figure ref={ref} className="grid gap-2" aria-label="Preview in the app">
      <TickerLine message={message} url={fields.url.trim() || null} severity={fields.severity} />
      <figcaption className="micro faint flex flex-wrap justify-between gap-2">
        <span>Preview: the app shows one line and cuts what does not fit.</span>
        <span className={cn(tooLong && 'text-danger')}>
          {message.length} / {NEWS_MESSAGE_MAX}
        </span>
      </figcaption>
    </figure>
  );
}
