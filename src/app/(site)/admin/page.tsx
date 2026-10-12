import Link from 'next/link';
import { Section, Stat } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { adminCounters } from '@/server/private/admin';

export const metadata = privatePageMetadata('Backoffice');

export default async function AdminHome() {
  await requireRole('moderator');
  const c = await adminCounters();
  const tiles = [
    { href: '/admin/handlers?queue=awaiting', value: c.awaiting, label: 'Awaiting approval' },
    {
      href: '/admin/handlers?queue=unverified',
      value: c.unverified,
      label: 'Listed with an unverified version',
    },
    { href: '/admin/reports', value: c.openReports, label: 'Open reports' },
    { href: '/admin/comments', value: c.comments24h, label: 'Comments, last 24 h' },
    { href: '/admin/users', value: c.users24h, label: 'New accounts, last 24 h' },
    { href: '/admin/handlers?queue=all', value: c.uploads24h, label: 'Uploads, last 24 h' },
  ];
  return (
    <Section title="Overview" headingLevel={1}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="block rounded-ctl bg-pane-2 p-4 transition-colors hover:bg-pane-3">
              <Stat value={t.value.toLocaleString('en')} label={t.label} />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
