import Link from 'next/link';
import { FilterLinks, pageParam, Pager } from '@/components/admin/ListFilters';
import { ActionForm, SubmitButton } from '@/components/interactive/ActionForm';
import { Badge, DateTime, EmptyState, Field, PlainText, Section } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { isValidId } from '@/lib/ids';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { hideCommentsAction, restoreCommentAction } from '@/server/actions/admin';
import { listCommentsForModeration } from '@/server/private/admin';

export const metadata = privatePageMetadata('Comments · Backoffice');

export default async function AdminComments({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; handler?: string; page?: string }>;
}) {
  await requireRole('moderator');
  const sp = await searchParams;
  const status = sp.status === 'deleted' || sp.status === 'all' ? sp.status : 'live';
  const q = (sp.q ?? '').slice(0, 100);
  const handlerId = sp.handler && isValidId(sp.handler) ? sp.handler : undefined;
  const page = pageParam(sp.page);
  const { rows, hasMore } = await listCommentsForModeration({ q, status, handlerId, page });
  const keep = { q, handler: handlerId };
  const href = (p: number) =>
    `/admin/comments?${new URLSearchParams({ status, ...(q && { q }), ...(handlerId && { handler: handlerId }), page: String(p) })}`;

  return (
    <Section title="Comments" headingLevel={1}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterLinks
            base="/admin/comments"
            param="status"
            current={status}
            keep={keep}
            options={[
              { value: 'live', label: 'Visible' },
              { value: 'deleted', label: 'Deleted' },
              { value: 'all', label: 'All' },
            ]}
          />
          <form method="get" role="search" className="flex gap-2">
            <input type="hidden" name="status" value={status} />
            {handlerId && <input type="hidden" name="handler" value={handlerId} />}
            <Field
              icon="search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Text or author"
              aria-label="Search comments"
            />
          </form>
        </div>
        {handlerId && (
          <p className="small">
            Comments of one handler.{' '}
            <Link href={`/admin/comments?status=${status}`} className="underline">
              Show all
            </Link>
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState icon="comment" title="No comment" />
        ) : (
          <ActionForm action={hideCommentsAction} className="gap-3">
            <ul className="grid gap-2">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className={`grid gap-2 rounded-ctl bg-pane-2 p-3 ${c.deletedAt ? 'opacity-70' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {!c.deletedAt && (
                      <input
                        type="checkbox"
                        name="commentId"
                        value={c.id}
                        aria-label="Select this comment"
                        className="h-4 w-4 accent-[var(--ink)]"
                      />
                    )}
                    <span className="small font-semibold text-ink">
                      {c.authorId && !c.authorDeletedAt ? (
                        <Link href={`/admin/users/${c.authorId}`} className="underline">
                          {c.authorName}
                        </Link>
                      ) : (
                        'Deleted user'
                      )}
                    </span>
                    <span className="micro faint">
                      on{' '}
                      <Link
                        href={`${paths.handler(c.gameSlug, c.handlerId)}#comment-${c.id}`}
                        className="underline"
                      >
                        {c.handlerTitle}
                      </Link>{' '}
                      · <DateTime value={c.createdAt} format="relative" />
                      {c.editedAt && ' · edited'}
                      {c.parentId && ' · reply'}
                    </span>
                    {c.deletedAt && (
                      <Badge tone="danger">
                        Deleted
                        {c.deletedByName
                          ? ` by ${c.deletedById === c.authorId ? 'author' : c.deletedByName}`
                          : ''}
                        {c.deleteReason ? `: ${c.deleteReason}` : ''}
                      </Badge>
                    )}
                  </div>
                  {c.body ? (
                    <PlainText text={c.body} className="small" />
                  ) : (
                    <p className="small faint">(body erased)</p>
                  )}
                </li>
              ))}
            </ul>
            {status !== 'deleted' && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  name="reason"
                  className="control max-w-md"
                  maxLength={500}
                  placeholder="Reason (audit log)"
                  aria-label="Reason"
                />
                <SubmitButton variant="danger" size="sm">
                  Hide selected
                </SubmitButton>
              </div>
            )}
          </ActionForm>
        )}
        {status !== 'live' && rows.some((c) => c.deletedAt && c.body && c.deletedById !== c.authorId) && (
          <div className="grid gap-2">
            <h2 className="h3">Restore</h2>
            <ul className="grid gap-1">
              {rows
                .filter((c) => c.deletedAt && c.body && c.deletedById !== c.authorId && !c.authorDeletedAt)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-2 small">
                    <span className="truncate">{c.body.slice(0, 80)}</span>
                    <ActionForm
                      action={restoreCommentAction.bind(null, c.id)}
                      inline
                      submitLabel="Restore"
                      submitVariant="ghost"
                      submitSize="sm"
                    />
                  </li>
                ))}
            </ul>
          </div>
        )}
        <Pager page={page} hasMore={hasMore} href={href} />
      </div>
    </Section>
  );
}
