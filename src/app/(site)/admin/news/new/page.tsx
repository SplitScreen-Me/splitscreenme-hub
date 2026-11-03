import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NewsFields } from '@/components/admin/NewsFields';
import { ActionForm, SubmitButton } from '@/components/interactive/ActionForm';
import { requireRole } from '@/lib/auth/current-user';
import { can } from '@/lib/auth/permissions';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { createNewsAction } from '@/server/actions/admin';

export const metadata = privatePageMetadata('New announcement · Backoffice');

export default async function NewNews() {
  const me = await requireRole('moderator');
  if (!can(me, 'news.manage')) notFound();
  return (
    <section className="pane pad grid gap-6" aria-labelledby="new-news-title">
      <div className="grid gap-2">
        <p className="micro faint">
          <Link href="/admin/news" className="underline">
            App news
          </Link>
        </p>
        <h1 className="h1" id="new-news-title">
          New announcement
        </h1>
        <p className="small muted max-w-prose">
          Short and concrete: what happens and what to do. Link to the fix rather than explaining it here.
        </p>
      </div>
      <ActionForm action={createNewsAction} className="max-w-3xl">
        <NewsFields now={new Date()} />
        {/* The draft button comes first: Enter in a field saves a draft, never publishes. */}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton name="intent" value="draft" variant="default">
            Save as draft
          </SubmitButton>
          <SubmitButton name="intent" value="publish" icon="check">
            Save and publish
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}
