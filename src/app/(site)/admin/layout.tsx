import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import { requireRole } from '@/lib/auth/current-user';
import { adminCounters } from '@/server/private/admin';

/** Backoffice frame: moderators and admins only (others get a 404, the backoffice does not reveal itself). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole('moderator');
  const counters = await adminCounters();
  return (
    <>
      <section className="pane pad grid gap-3">
        <p className="micro faint font-semibold tracking-wide uppercase">
          Backoffice · {user.role === 'admin' ? 'admin' : 'moderator'}
        </p>
        <AdminNav isAdmin={user.role === 'admin'} openReports={counters.openReports} />
      </section>
      {children}
    </>
  );
}
