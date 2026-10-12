import Link from 'next/link';
import { HandlerMetaFields } from '@/components/dashboard/HandlerMetaFields';
import { ActionForm, FieldErrors } from '@/components/interactive/ActionForm';
import { CoverImage, EmptyState, Field, Icon, LinkButton } from '@/components/ui';
import { canPost, requireUser } from '@/lib/auth/current-user';
import { igdbEnabled } from '@/lib/env';
import { releaseYearOf, searchGames, type IgdbGame } from '@/lib/igdb';
import { log } from '@/lib/log';
import { hit } from '@/lib/rate-limit';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { createHandlerAction } from '@/server/actions/dashboard';
import { searchLocalGames } from '@/server/private/handlers';

export const metadata = privatePageMetadata('New handler');

interface Choice {
  value: string;
  name: string;
  year: number | null;
  coverImageId: string | null;
  note: string;
}

export default async function NewHandlerPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  if (!canPost(user)) {
    return (
      <section className="pane pad">
        <EmptyState
          icon="lock"
          title="Confirm your account first"
          action={<LinkButton href={paths.account()}>Account page</LinkButton>}
        >
          <p>Confirm your email address or link Discord, GitHub or Google before publishing handlers.</p>
        </EmptyState>
      </section>
    );
  }
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  const local = q.length >= 2 ? await searchLocalGames(q, 8) : [];
  let remote: IgdbGame[] = [];
  let igdbNote: string | null = null;
  if (q.length >= 2 && igdbEnabled()) {
    if (hit('igdb-search', user.id).ok) {
      remote = await searchGames(q, 10).catch((err: unknown) => {
        log.warn('igdb.search_failed', { err });
        igdbNote = 'IGDB did not answer; only games already on the hub are listed.';
        return [];
      });
    } else {
      igdbNote = 'Searching too fast for IGDB: wait a few seconds and search again.';
    }
  }
  const knownIgdb = new Set(local.map((g) => g.igdbId).filter(Boolean));
  const choices: Choice[] = [
    ...local.map((g) => ({
      value: `g:${g.id}`,
      name: g.name,
      year: g.releaseYear,
      coverImageId: g.coverImageId,
      note: g.handlers ? `On the hub · ${g.handlers} handler${g.handlers > 1 ? 's' : ''}` : 'On the hub',
    })),
    ...remote
      .filter((g) => !knownIgdb.has(g.id))
      .map((g) => ({
        value: `i:${g.id}`,
        name: g.name,
        year: releaseYearOf(g),
        coverImageId: g.cover?.image_id ?? null,
        note: 'From IGDB · new on the hub',
      })),
  ];

  return (
    <>
      <section className="pane pad grid gap-2">
        <p className="micro faint font-semibold tracking-wide uppercase">
          <Link href={paths.dashboard()} className="underline">
            Dashboard
          </Link>{' '}
          / New handler
        </p>
        <h1 className="h1">New handler</h1>
        <p className="muted max-w-prose">
          Pick the game, describe the handler, then upload its package on the next page. It stays private
          until you publish it{user.trustedAuthor ? '' : ', and a moderator approves it before it is listed'}.
        </p>
      </section>

      <section className="pane pad grid gap-4" aria-labelledby="game-step">
        <h2 className="h2" id="game-step">
          1. The game
        </h2>
        <form method="get" role="search" className="flex max-w-xl gap-2">
          <Field
            icon="search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search a game by name"
            aria-label="Game name"
            className="flex-1"
          />
          <button type="submit" className="btn">
            Search
          </button>
        </form>
        {!igdbEnabled() && (
          <p className="small muted">
            <Icon name="info" className="inline h-4 w-4 align-[-3px]" /> IGDB is not configured on this
            server: only games already on the hub can be picked.
          </p>
        )}
        {igdbNote && <p className="small muted">{igdbNote}</p>}
        {q.length >= 2 && choices.length === 0 && (
          <p className="small">No game found for &ldquo;{q}&rdquo;.</p>
        )}
      </section>

      {choices.length > 0 && (
        <section className="pane pad grid gap-6" aria-labelledby="details-step">
          <ActionForm action={createHandlerAction} submitLabel="Create handler" submitIcon="plus">
            <fieldset className="grid gap-2">
              <legend className="form-label mb-2">Pick the game</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {choices.map((c, i) => (
                  <label
                    key={c.value}
                    className="flex cursor-pointer items-center gap-3 rounded-ctl bg-pane-2 p-2 has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink"
                  >
                    <input
                      type="radio"
                      name="game"
                      value={c.value}
                      defaultChecked={i === 0}
                      required
                      className="sr-only"
                    />
                    <CoverImage
                      imageId={c.coverImageId}
                      alt=""
                      size="t_cover_small"
                      className="w-10 shrink-0"
                    />
                    <span className="grid min-w-0">
                      <span className="truncate font-semibold text-ink">
                        {c.name}
                        {c.year ? <span className="muted font-normal"> ({c.year})</span> : null}
                      </span>
                      <span className="micro faint">{c.note}</span>
                    </span>
                  </label>
                ))}
              </div>
              <FieldErrors name="game" />
            </fieldset>
            <h2 className="h2" id="details-step">
              2. The handler
            </h2>
            <HandlerMetaFields defaults={{ title: choices[0]?.name }} />
          </ActionForm>
        </section>
      )}
    </>
  );
}
