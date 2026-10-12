import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DownloadsChart } from '@/components/dashboard/DownloadsChart';
import { HandlerMetaFields } from '@/components/dashboard/HandlerMetaFields';
import { HandlerTabs } from '@/components/dashboard/HandlerTabs';
import { StateBadge, stateHint } from '@/components/dashboard/StateBadge';
import { ActionForm, TextField } from '@/components/interactive/ActionForm';
import { Badge, Dialog, Icon, LinkButton, Section } from '@/components/ui';
import { requireUser } from '@/lib/auth/current-user';
import { isValidId } from '@/lib/ids';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { deleteHandlerAction, setPublicAction, updateHandlerAction } from '@/server/actions/dashboard';
import { getHandlerForEdit, handlerStats } from '@/server/private/dashboard';

export const metadata = privatePageMetadata('Edit handler');

export default async function EditHandlerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const h = await getHandlerForEdit(user, id);
  if (!h) notFound();
  const stats = await handlerStats(h.id, 90);
  const isOwner = h.ownerId === user.id;

  return (
    <>
      <section className="pane pad grid gap-4">
        <p className="micro faint font-semibold tracking-wide uppercase">
          <Link href={paths.dashboard()} className="underline">
            Dashboard
          </Link>{' '}
          / {h.gameName}
        </p>
        <div className="pane-head">
          <h1 className="h1">{h.title}</h1>
          {h.state === 'listed' && (
            <LinkButton href={paths.handler(h.gameSlug, h.id)} variant="ghost" size="sm" iconAfter="external">
              View on the hub
            </LinkButton>
          )}
        </div>
        {!isOwner && (
          <p className="small" role="note">
            <Icon name="info" className="inline h-4 w-4 align-[-3px]" /> You are editing {h.ownerName}&rsquo;s
            handler as a moderator.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={h.state} withHint />
          {h.unverified && (
            <Badge tone="warn" icon="warning">
              Current version unverified
            </Badge>
          )}
        </div>
        <HandlerTabs handlerId={h.id} current="details" />
      </section>

      <Section title="Visibility" id="visibility">
        <div className="grid gap-3">
          {h.state === 'draft' ? (
            <p className="small">
              Upload a first version on the{' '}
              <Link href={`${paths.dashboardHandler(h.id)}/versions`} className="underline">
                Versions
              </Link>{' '}
              tab, then publish.
            </p>
          ) : h.isPublic ? (
            <>
              <p className="small muted">
                {h.approvedAt
                  ? 'Public and approved: it is on the hub and in the app.'
                  : stateHint('awaiting_approval')}
              </p>
              <ActionForm
                action={setPublicAction.bind(null, h.id, false)}
                submitLabel="Make private"
                submitVariant="default"
                submitIcon="lock"
              />
            </>
          ) : (
            <>
              <p className="small muted">
                Private: only you and moderators see it.{' '}
                {h.approvedAt
                  ? 'It was approved before: publishing lists it again right away.'
                  : 'Publishing sends it to the approval queue.'}
              </p>
              <ActionForm
                action={setPublicAction.bind(null, h.id, true)}
                submitLabel="Publish"
                submitIcon="unlock"
              />
            </>
          )}
        </div>
      </Section>

      <Section title="Details" id="details">
        <ActionForm action={updateHandlerAction.bind(null, h.id)} submitLabel="Save changes">
          <p className="small muted">
            Game: <strong className="text-ink">{h.gameName}</strong>. Wrong game? Ask a moderator.
          </p>
          <HandlerMetaFields
            defaults={{
              title: h.title,
              description: h.description,
              maxPlayers: h.maxPlayers,
              controllers: h.supportsControllers,
              keyboardMouse: h.supportsKeyboardMouse,
              multiKeyboardMouse: h.supportsMultiKeyboardMouse,
            }}
          />
        </ActionForm>
      </Section>

      <Section title="Downloads" id="stats">
        <DownloadsChart {...stats} total={h.downloadCount} />
        <p className="small muted mt-4">
          {h.starCount} star{h.starCount === 1 ? '' : 's'} · {h.commentCount} comment
          {h.commentCount === 1 ? '' : 's'}
          {h.openReportCount
            ? ` · ${h.openReportCount} open report${h.openReportCount === 1 ? '' : 's'}`
            : ''}
        </p>
      </Section>

      <Section title="Delete" id="delete">
        <div className="grid gap-3">
          <p className="small muted">
            Removes the handler from the hub and the app. Moderators can restore it on request; the versions
            are kept.
          </p>
          <div>
            <Dialog triggerLabel="Delete this handler" triggerVariant="danger" title={`Delete “${h.title}”?`}>
              <ActionForm
                action={deleteHandlerAction.bind(null, h.id)}
                submitLabel="Delete"
                submitVariant="danger"
              >
                <TextField name="confirm" label='Type "delete" to confirm' required autoComplete="off" />
              </ActionForm>
            </Dialog>
          </div>
        </div>
      </Section>
    </>
  );
}
