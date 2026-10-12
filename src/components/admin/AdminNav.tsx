'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/handlers', label: 'Handlers' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/comments', label: 'Comments' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/games', label: 'Games' },
  { href: '/admin/audit', label: 'Audit log', adminOnly: true },
];

export function AdminNav({ isAdmin, openReports }: { isAdmin: boolean; openReports: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Backoffice" className="flex flex-wrap gap-1">
      {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => {
        const current = i.exact
          ? pathname === i.href
          : pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={current ? 'page' : undefined}
            className={cn('btn btn-sm', current ? 'btn-primary' : 'btn-ghost')}
          >
            {i.label}
            {i.href === '/admin/reports' && openReports > 0 && (
              <span className="badge badge-danger ml-1" aria-label={`${openReports} open`}>
                {openReports}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
