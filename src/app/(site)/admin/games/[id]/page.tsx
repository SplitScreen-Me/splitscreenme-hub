import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StateBadge } from '@/components/dashboard/StateBadge';
import { ActionForm, SelectField, TextField } from '@/components/interactive/ActionForm';
import { CoverImage, DateTime, Section } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { igdbEnabled } from '@/lib/env';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { refreshGameAction, updateGameAction } from '@/server/actions/admin';
import { getGameForAdmin } from '@/server/private/admin';

export const metadata = privatePageMetadata('Game · Backoffice');

export default async function AdminGame({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('moderator');
  const gameId = Number((await params).id);
  if (!Number.isSafeInteger(gameId) || gameId < 1) notFound();
  const data = await getGameForAdmin(gameId);
  if (!data) notFound();
  const { game: g, handlers, redirects } = data;

  return (
    <>
      <section className="pane pad grid grid-cols-[72px_1fr] items-start gap-4">
        <CoverImage imageId={g.coverImageId} alt="" size="t_cover_small" className="w-[72px]" />
        <div className="grid gap-2">
          <p className="micro faint">
            <Link href="/admin/games" className="underline">
              Games
            </Link>
          </p>
          <h1 className="h1">{g.name}</h1>
          <p className="small muted">
            {g.releaseYear ?? 'Year unknown'} · {g.genres.join(', ') || 'no genre'} · IGDB{' '}
            {g.igdbId ?? 'none'} · synced {g.igdbSyncedAt ? <DateTime value={g.igdbSyncedAt} /> : 'never'} ·{' '}
            <Link href={paths.game(g.slug)} className="underline">
              public page
            </Link>
          </p>
        </div>
      </section>

      <Section title="Settings" id="settings">
        <div className="grid gap-8 md:grid-cols-2">
          <ActionForm action={updateGameAction.bind(null, g.id)} submitLabel="Save">
            <TextField
              name="slug"
              label="Slug"
              defaultValue={g.slug}
              required
              maxLength={80}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              hint={`/hub/${g.slug}. The old slug keeps redirecting (308).${redirects.length ? ` Old slugs: ${redirects.map((r) => r.oldSlug).join(', ')}.` : ''}`}
            />
            <TextField
              name="steamAppId"
              label="Steam app id"
              type="number"
              min={1}
              defaultValue={g.steamAppId ?? ''}
              inputMode="numeric"
              hint="Empty for none."
            />
            <SelectField
              name="featuredHandlerId"
              label="Featured handler"
              defaultValue={g.featuredHandlerId ?? ''}
              options={[
                { value: '', label: 'Automatic (verified, then trending)' },
                ...handlers.map((h) => ({
                  value: h.id,
                  label: `${h.title} · ${h.ownerName}${h.state === 'listed' ? '' : ` (${h.state})`}`,
                })),
              ]}
              hint="Rendered on the game page when it is listed."
            />
          </ActionForm>
          <div className="grid content-start gap-3">
            <p className="small muted">
              Fetch the name, cover, summary, genres, screenshots and Steam id again from IGDB.
            </p>
            {igdbEnabled() && g.igdbId ? (
              <ActionForm
                action={refreshGameAction.bind(null, g.id)}
                submitLabel="Refresh from IGDB"
                submitVariant="default"
                submitIcon="refresh"
              />
            ) : (
              <p className="small">
                {g.igdbId ? 'IGDB is not configured on this server.' : 'This game has no IGDB id.'}
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Handlers" id="handlers">
        <ul className="grid gap-2">
          {handlers.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 small">
              <Link href={`/admin/handlers/${h.id}`} className="underline">
                {h.title}
              </Link>
              <span className="muted">{h.ownerName}</span>
              <StateBadge state={h.state} />
              <span className="faint">{h.downloadCount.toLocaleString('en')} downloads</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
