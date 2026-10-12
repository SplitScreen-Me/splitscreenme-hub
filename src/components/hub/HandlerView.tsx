import Link from 'next/link';
import { CommentForm } from '@/components/interactive/CommentForm';
import { StarButton } from '@/components/interactive/StarButton';
import { Breadcrumbs, DateTime, Icon, LinkButton, SafeMarkdown, type Crumb } from '@/components/ui';
import { cn } from '@/lib/cn';
import { genreInfo } from '@/lib/genres';
import { howToHeading, inputPhrase, playersPhrase, type HowToStep } from '@/lib/seo/game';
import { apiDownloadUrl, paths } from '@/lib/urls';
import type { HandlerPageData } from '@/server/hub';
import { CommentList, formatBytes, Screenshots, VersionSummary } from './CommunitySections';
import { Shelf } from './GameCard';
import { CompatTable, HowToSteps, Requirements } from './GameSections';
import { InputIcons, Pips } from './Pips';
import { ReportDialog } from './ReportDialog';
import { heroArt, SplitHero } from './SplitHero';
import { initial } from './variant';
import './hub.css';

const HELP_LINKS = [
  { href: paths.doc('getting-started'), label: 'Getting started', icon: 'book' },
  { href: paths.doc('play/controllers'), label: 'Controllers', icon: 'pad' },
  { href: paths.doc('play/keyboard-and-mouse'), label: 'Several keyboards and mice', icon: 'multi' },
  {
    href: paths.doc('troubleshooting/handler-does-not-work'),
    label: 'A handler does not work',
    icon: 'warning',
  },
  { href: paths.doc('troubleshooting/performance'), label: 'Low FPS, stretched windows', icon: 'monitor' },
  { href: paths.doc('faq'), label: 'FAQ', icon: 'comment' },
] as const;

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/**
 * A handler in full (mockup `web/game.html`): on the game page for the primary handler (`mode="game"`),
 * on its own page otherwise. Everything shown comes from listed data only.
 */
export function HandlerView({
  data,
  mode,
  pagePath,
  steps,
  crumbs,
  starred,
  commentsBefore,
}: {
  data: HandlerPageData;
  mode: 'game' | 'handler';
  /** canonical path of this page (comments pagination, anchors) */
  pagePath: string;
  steps: HowToStep[];
  crumbs: Crumb[];
  /** the viewer starred this handler */
  starred: boolean;
  commentsBefore?: Date;
}) {
  const { game, handler: h, versions, comments, others, related, authorStats, primaryIds } = data;
  const title = mode === 'game' ? game.name : h.title;
  const inputs = inputPhrase(h.inputs);
  const genres = game.genres.map(genreInfo);
  const art = heroArt(game);
  const versionsHref = paths.versions(game.slug, h.id);
  const authorHref = h.authorId ? paths.author(h.authorName) : null;
  const commentCount = h.comments;

  return (
    <>
      <section className="hub-hero" aria-labelledby="hub-title">
        <div className="pane hub-hero-text">
          <Breadcrumbs items={crumbs} />
          <div className="body">
            <div>
              <p className="hub-eyebrow">
                {mode === 'game' ? 'Split-screen on PC' : `${game.name} · community handler`}
              </p>
              <h1 id="hub-title" className={cn(title.length > 26 && 'is-long')}>
                {title}
              </h1>
            </div>
            <p className="summary">
              {h.maxPlayers >= 2 ? `Up to ${h.maxPlayers} players on one PC` : 'Play together on one PC'}
              {inputs ? `, ${inputs}` : ''}.
            </p>
            <div className="hub-quick">
              <Pips count={h.maxPlayers} large />
              <InputIcons inputs={h.inputs} />
              {h.verified && (
                <span className="verified">
                  <Icon name="seal" />
                  Verified handler
                </span>
              )}
            </div>
            <p className="hub-handler-line">
              {mode === 'game' ? <>Handler “{h.title}”</> : 'Handler'} by{' '}
              {authorHref ? <Link href={authorHref}>{h.authorName}</Link> : h.authorName}, version {h.version}
            </p>
          </div>
        </div>
        <SplitHero gameName={game.name} maxPlayers={h.maxPlayers} art={art} />
      </section>

      <div className="hub-body">
        <div className="hub-content">
          <section className="pane hub-section" aria-labelledby="h-works">
            <h2 className="h3" id="h-works">
              What works
            </h2>
            <p className="hub-intro">
              With Nucleus Co-op, {playersPhrase(h.maxPlayers)} can play {game.name} together on one PC, each
              in their own part of the screen{inputs ? `, ${inputs}` : ''}. The free community handler “
              {h.title}” by {h.authorName} does the setup
              {h.verified ? ' and was checked by hub moderators' : ''}: version {h.version}, updated{' '}
              <DateTime value={h.currentVersion.createdAt} />.
              {genres.length > 0 && (
                <>
                  {' '}
                  {game.name} is {article(genres[0]!.label)}{' '}
                  {genres.map((g, i) => (
                    <span key={g.slug}>
                      {i > 0 && (i === genres.length - 1 ? ' and ' : ', ')}
                      <Link href={paths.genre(g.slug)}>{g.label.toLowerCase()}</Link>
                    </span>
                  ))}{' '}
                  game{game.releaseYear ? ` from ${game.releaseYear}` : ''}.
                </>
              )}
            </p>
            <CompatTable maxPlayers={h.maxPlayers} inputs={h.inputs} verified={h.verified} />
          </section>

          <section className="pane hub-section" id="how-to" aria-labelledby="how-to-title">
            <h2 className="h2" id="how-to-title">
              {howToHeading(game.name)}
            </h2>
            <HowToSteps steps={steps} handlerId={h.id} />
          </section>

          <section className="pane hub-section" aria-labelledby="h-needs">
            <h2 className="h3" id="h-needs">
              What you need
            </h2>
            <Requirements gameName={game.name} maxPlayers={h.maxPlayers} inputs={h.inputs} />
          </section>

          <section className="pane hub-section" aria-labelledby="h-notes">
            <h2 className="h2" id="h-notes">
              Handler notes
            </h2>
            {h.description.trim() ? (
              <SafeMarkdown source={h.description} className="hub-notes" />
            ) : (
              <p className="hub-notes text-ink-2">
                {h.authorName} has not written notes for this handler yet. Nucleus shows the author&apos;s
                notes before you launch, and the comments often have tips from other players.
              </p>
            )}
            {game.summary && (
              <div className="hub-about">
                <h3>About {game.name}</h3>
                <p>{game.summary}</p>
                {game.igdbUrl && (
                  <p className="source">
                    Summary from{' '}
                    <a href={game.igdbUrl} rel="noopener noreferrer">
                      IGDB
                    </a>
                  </p>
                )}
              </div>
            )}
          </section>

          {game.screenshots.length > 0 && (
            <section className="pane hub-section" aria-labelledby="h-shots">
              <h2 className="h3" id="h-shots">
                {game.name} screenshots
              </h2>
              <Screenshots gameName={game.name} shots={game.screenshots} />
            </section>
          )}

          <div className="hub-two-up">
            <section className="pane hub-section" id="versions" aria-labelledby="h-history">
              <h2 className="h3" id="h-history">
                Version history
              </h2>
              <VersionSummary
                handlerId={h.id}
                versions={versions}
                currentVersion={h.version}
                versionsHref={versionsHref}
              />
            </section>
            <section className="pane hub-section" id="comments" aria-labelledby="h-comments">
              <h2 className="h3" id="h-comments">
                Comments <span className="faint data">{commentCount.toLocaleString('en-US')}</span>
              </h2>
              {commentsBefore && (
                <p className="small mb-4">
                  <Link href={`${pagePath}#comments`} className="text-ink-2">
                    Back to the latest comments
                  </Link>
                </p>
              )}
              {comments.items.length > 0 ? (
                <CommentList comments={comments.items} />
              ) : (
                <p className="small text-ink-2">
                  No comments yet. Played it? Share what worked for your group.
                </p>
              )}
              {comments.nextCursor && (
                <p className="small mt-5 mb-0">
                  <Link
                    href={`${pagePath}?before=${encodeURIComponent(comments.nextCursor)}#comments`}
                    className="text-ink-2"
                    rel="nofollow"
                  >
                    Older comments
                  </Link>
                </p>
              )}
              <div className="hub-comment-form">
                <CommentForm handlerId={h.id} />
              </div>
            </section>
          </div>

          {others.length > 0 && (
            <section className="pane hub-section" aria-labelledby="h-others">
              <h2 className="h3" id="h-others">
                {mode === 'game' ? `Other handlers for ${game.name}` : `More handlers for ${game.name}`}
              </h2>
              <Shelf handlers={others} primaryIds={primaryIds} className="is-row" />
            </section>
          )}
        </div>

        <aside className="hub-side" aria-label={`Get ${game.name} running`}>
          <div className="pane hub-action">
            <a className="btn btn-primary btn-lg" href={apiDownloadUrl(h.id)} rel="nofollow">
              <Icon name="download" />
              Download handler
            </a>
            <p className="note">
              Version {h.version}, {formatBytes(h.currentVersion.sizeBytes)}. Needs Nucleus Co-op:{' '}
              <Link href={paths.download()}>get it for Windows</Link>, it&apos;s free.
            </p>
            <LinkButton href={paths.download()} variant="ghost" icon="play">
              Get Nucleus Co-op
            </LinkButton>
            <dl className="hub-facts">
              <div>
                <dt>Version</dt>
                <dd className="data">
                  <a href="#versions" className="text-inherit">
                    v{h.version}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd className="data">
                  <DateTime value={h.currentVersion.createdAt} />
                </dd>
              </div>
              <div>
                <dt>Downloads</dt>
                <dd className="data">{h.downloads.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Stars</dt>
                <dd>
                  <StarButton handlerId={h.id} starred={starred} count={h.stars} />
                </dd>
              </div>
              <div>
                <dt>Comments</dt>
                <dd className="data">
                  <a href="#comments" className="text-inherit">
                    {commentCount.toLocaleString('en-US')}
                  </a>
                </dd>
              </div>
            </dl>
            {authorHref ? (
              <Link className="hub-author" href={authorHref}>
                <span className="hub-avatar" aria-hidden="true">
                  {initial(h.authorName)}
                </span>
                <span>
                  <b>{h.authorName}</b>
                  {authorStats && (
                    <small>
                      {authorStats.handlers} {authorStats.handlers === 1 ? 'handler' : 'handlers'},{' '}
                      {authorStats.downloads.toLocaleString('en-US')} downloads
                    </small>
                  )}
                </span>
              </Link>
            ) : (
              <div className="hub-author">
                <span className="hub-avatar" aria-hidden="true">
                  ?
                </span>
                <span>
                  <b>{h.authorName}</b>
                </span>
              </div>
            )}
            <div className="hub-report">
              Not working after a game update? <a href="#comments">Tell the author in the comments</a>.
              Something worse? <ReportDialog handlerId={h.id} version={h.version} />
            </div>
          </div>
          <nav className="pane hub-action" aria-labelledby="h-help">
            <h2 className="h3" id="h-help">
              Need help?
            </h2>
            <ul className="hub-linklist">
              {HELP_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>
                    <Icon name={l.icon} />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="pane hub-section" aria-labelledby="h-related">
          <header>
            <h2 className="h2" id="h-related">
              Play these next
            </h2>
            <Link href={paths.hub()}>Browse all games</Link>
          </header>
          <Shelf handlers={related} primaryIds={primaryIds} className="is-row" />
          {genres.length > 0 && (
            <p className="small text-ink-2 mt-6 mb-0">
              Browse by genre:{' '}
              {genres.map((g, i) => (
                <span key={g.slug}>
                  {i > 0 && ' · '}
                  <Link href={paths.genre(g.slug)} className="text-ink">
                    {g.label}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </section>
      )}
    </>
  );
}
