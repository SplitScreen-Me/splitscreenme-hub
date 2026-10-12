import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui';
import { ICONS } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { absoluteUrl, paths } from '@/lib/urls';
import { getGameBySlug } from '@/server/public';

/** MDX props are not type-checked: an unknown icon name renders nothing instead of failing the page. */
const knownIcon = (name: string | undefined): name is IconName => !!name && Object.hasOwn(ICONS, name);

/**
 * Components available in every docs MDX file without an import (wired in src/mdx-components.tsx).
 * All server components: the only client part of the docs content is <YouTube>.
 */

const CALLOUT: Record<CalloutType, { icon: IconName; label: string }> = {
  note: { icon: 'info', label: 'Note' },
  tip: { icon: 'bolt', label: 'Tip' },
  warning: { icon: 'warning', label: 'Warning' },
  danger: { icon: 'warning', label: 'Careful' },
};
type CalloutType = 'note' | 'tip' | 'warning' | 'danger';

/** A boxed remark. Status colours tint the icon and the edge only; the text stays ink. */
export function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: CalloutType;
  title?: ReactNode;
  children?: ReactNode;
}) {
  const c = CALLOUT[type] ?? CALLOUT.note;
  return (
    <aside className={cn('doc-callout', `is-${type}`)} aria-label={typeof title === 'string' ? title : c.label}>
      <Icon name={c.icon} className="doc-callout-icon" />
      <div className="doc-callout-body">
        <p className="doc-callout-title">{title ?? c.label}</p>
        {children}
      </div>
    </aside>
  );
}

/** Numbered steps: <Steps><Step title="...">...</Step></Steps>. */
export function Steps({ children }: { children?: ReactNode }) {
  return <ol className="doc-steps not-prose">{children}</ol>;
}

export function Step({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <li className="doc-step">
      <p className="doc-step-title">{title}</p>
      <div className="doc-step-body prose prose-invert prose-bezel max-w-none">{children}</div>
    </li>
  );
}

/** A screenshot or diagram with explicit size (no layout shift) and an optional caption. */
export function Figure({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  width: number;
  height: number;
}) {
  return (
    <figure className="doc-figure">
      {/* eslint-disable-next-line @next/next/no-img-element -- images are served as is (images.unoptimized) */}
      <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/**
 * Link to a game page of the hub. The game is looked up (cached): an unknown or unlisted slug, or a database
 * that can't be reached, falls back to a hub search for the link text, so a docs page never links to a 404.
 */
export async function GameLink({ slug, children }: { slug: string; children?: ReactNode }) {
  const label = children ?? slug;
  let href = paths.hubSearch(typeof children === 'string' ? children : slug.replace(/-/g, ' '));
  try {
    const found = await getGameBySlug(slug);
    if (found?.kind === 'game') href = paths.game(found.game.slug);
    else if (found?.kind === 'redirect') href = paths.game(found.slug);
  } catch {
    // keep the search link
  }
  return <Link href={href}>{label}</Link>;
}

/** An absolute URL of this site, from SITE_URL at request time (the docs never hardcode a host). */
export function SiteUrl({ path = '/' }: { path?: string }) {
  return <code>{absoluteUrl(path)}</code>;
}

/** Site paths that are not pages (API, files): a full navigation, not a client-side one. */
const isDocument = (href: string) =>
  href.startsWith('/api/') || /\/[^/?#]+\.[a-z0-9]{2,5}($|[?#])/i.test(href);

/** Overview cards (docs home, section indexes). */
export function CardGrid({ children }: { children?: ReactNode }) {
  return <div className="doc-cards not-prose">{children}</div>;
}

export function Card({
  href,
  title,
  icon,
  children,
}: {
  href: string;
  title: string;
  icon?: string;
  children?: ReactNode;
}) {
  const Tag = isDocument(href) ? 'a' : Link;
  return (
    <Tag href={href} className="doc-card">
      {knownIcon(icon) && <Icon name={icon} className="doc-card-icon" />}
      <span className="doc-card-title">{title}</span>
      {children && <span className="doc-card-text">{children}</span>}
      <Icon name="chev-r" className="doc-card-arrow" />
    </Tag>
  );
}

/** Markdown links: internal ones go through next/link, external ones get rel="noopener". */
export function DocLink({ href = '', children, ...rest }: ComponentProps<'a'>) {
  if (href.startsWith('/') && !href.startsWith('//') && !isDocument(href)) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} rel="noopener" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

/** Markdown tables scroll sideways on small screens instead of overflowing the pane. */
export function DocTable(props: ComponentProps<'table'>) {
  return (
    <div className="doc-table">
      <table {...props} />
    </div>
  );
}

/** Markdown images: lazy, and never wider than the column. */
export function DocImage({ alt = '', ...rest }: ComponentProps<'img'>) {
  // eslint-disable-next-line @next/next/no-img-element -- images are served as is (images.unoptimized)
  return <img alt={alt} loading="lazy" decoding="async" {...rest} />;
}
