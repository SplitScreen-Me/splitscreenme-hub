'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

interface NavItem {
  href: string;
  label: string;
}

const isCurrent = (pathname: string, href: string) =>
  !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`));

export function MainNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Small screens: the same links in a disclosure (works without JS). */
export function MobileNav({ items, signedIn }: { items: readonly NavItem[]; signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <details className="menu site-burger">
      <summary className="btn btn-ghost btn-icon" aria-label="Menu">
        <Icon name="more" />
      </summary>
      <nav className="menu-panel" aria-label="Main (mobile)">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
        <hr />
        <Link href="/hub">
          <Icon name="search" /> Search games
        </Link>
        {!signedIn && (
          <>
            <Link href="/login">Log in</Link>
            <Link href="/register">Register</Link>
          </>
        )}
      </nav>
    </details>
  );
}
