import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NewsStatusBadge, SeverityBadge } from '@/components/admin/NewsBadges';
import { NewsFields } from '@/components/admin/NewsFields';
import { ActionForm } from '@/components/interactive/ActionForm';
import { DateTime, Dialog, DialogClose, Section } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { can } from '@/lib/auth/permissions';
import { isValidId } from '@/lib/ids';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { deleteNewsAction, publishNewsAction, updateNewsAction } from '@/server/actions/admin';
import { getNewsForAdmin } from '@/server/private/news';

export const metadata = privatePageMetadata('Announcement · Backoffice');

export default async function AdminNewsItem({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole('moderator');
  if (!can(me, 'news.manage')) notFound();
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const now = new Date();
  const n = await getNewsForAdmin(id, now);
  if (!n) notFound();

  return (
    <>
      <section className="pane pad grid gap-3" aria-labelledby="news-title">
        <p className="micro faint">
          <Link href="/admin/news" className="underline">
            App news
          </Link>
        </p>
        <h1 className="h1" id="news-title">
          Announcement
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <NewsStatusBadge status={n.status} withHint />
          <SeverityBadge severity={n.severity} />
        </div>
        <p className="small muted">
          Written by {n.authorName ?? 'a deleted account'} <DateTime value={n.createdAt} format="datetime" />{' '}
          · updated <DateTime value={n.updatedAt} format="relative" /> · id <code>{n.id}</code>
        </p>
      </section>

      <Section title="Message" id="message">
        <ActionForm
          action={updateNewsAction.bind(null, n.id)}
          submitLabel="Save changes"
          className="max-w-3xl"
        >
          <NewsFields
            now={now}
            defaults={{
              message: n.message,
              url: n.url,
              severity: n.severity,
              startsAt: n.startsAt,
              endsAt: n.endsAt,
            }}
          />
        </ActionForm>
      </Section>

      <Section title="Visibility" id="visibility">
        <div className="grid gap-3">
          <p className="small muted max-w-prose">
            {n.published
              ? 'Published: the app shows it between its start and end dates. Unpublishing removes it from the app within a minute; you can publish it again later.'
              : 'Draft: the app does not show it. Publishing shows it between its start and end dates.'}
          </p>
          <ActionForm
            action={publishNewsAction.bind(null, n.id, !n.published)}
            submitLabel={n.published ? 'Unpublish' : 'Publish'}
            submitVariant={n.published ? 'default' : 'primary'}
            submitIcon={n.published ? 'stop' : 'check'}
          />
        </div>
      </Section>

      <Section title="Delete" id="delete">
        <div className="grid gap-3">
          <p className="small muted max-w-prose">
            Deletes the announcement for good (the audit log keeps its text). To take it down for now,
            unpublish it instead.
          </p>
          <div>
            <Dialog triggerLabel="Delete this announcement" triggerVariant="danger" title="Delete it?">
              <p className="small break-words">&ldquo;{n.message}&rdquo;</p>
              <p className="small muted">The app stops showing it within a minute. This cannot be undone.</p>
              {/* Side by side, not nested: the cancel button is a form of its own (method="dialog"). */}
              <div className="dialog-actions">
                <DialogClose />
                <ActionForm
                  action={deleteNewsAction.bind(null, n.id)}
                  submitLabel="Delete for good"
                  submitVariant="danger"
                  inline
                />
              </div>
            </Dialog>
          </div>
        </div>
      </Section>
    </>
  );
}
