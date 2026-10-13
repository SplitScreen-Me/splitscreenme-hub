import Link from 'next/link';
import { getLandingData, type LandingGame } from '@/components/landing/data';
import { SplitTv } from '@/components/landing/SplitTv';
import '@/components/landing/landing.css';
import { JsonLd } from '@/components/seo/JsonLd';
import { CoverImage, Icon, LinkButton, LogoMark, PlayerTag, formatCount } from '@/components/ui';
import { heroScenes, landingFaq } from '@/content/collections';
import { release, releaseMonth, releaseSize, stableRelease } from '@/content/release';
import { landingJsonLd } from '@/lib/seo/landing';
import { buildMetadata } from '@/lib/seo/metadata';
import { COMMUNITY, igdbCoverUrl, paths, steamHeroUrl } from '@/lib/urls';

// Canonicals read SITE_URL at runtime: generateMetadata, never a static `metadata` export.
export const generateMetadata = () =>
  buildMetadata({
    title: 'Split-screen for PC games that never had it | SplitScreen.Me',
    absoluteTitle: true,
    description:
      'Nucleus Co-op runs one copy of a PC game per player, gives every controller its own window and tiles them on your screen. Free, open source, 600+ games ready to play.',
    path: '/',
  });

const nf = new Intl.NumberFormat('en-US');

function GameCard({ game, rank }: { game: LandingGame; rank: number }) {
  return (
    <Link href={paths.game(game.slug)} className="lp-game-card">
      <div className="relative">
        <CoverImage imageId={game.coverImageId} alt={`${game.name} cover art`} size="t_cover_big" />
        <span className="lp-rank" aria-label={`Rank ${rank}`}>
          {rank}
        </span>
      </div>
      <div className="lp-game-name">
        <span>{game.name}</span>
        {game.verified && <Icon name="seal" label="Verified handler" />}
      </div>
      <div className="lp-facts data">
        <span>
          <Icon name="users" />
          {game.maxPlayers} players
        </span>
        <span>
          <Icon name="download" />
          {formatCount(game.downloads)}
        </span>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const data = await getLandingData();
  const scenes = heroScenes.map((s) => ({
    name: s.name,
    image: steamHeroUrl(s.steamAppId),
    href: data.heroLinks[s.slug] ? paths.game(data.heroLinks[s.slug]!) : undefined,
  }));
  const gameCount = data.stats?.games;
  const browseLabel = gameCount && gameCount >= 100 ? `Browse ${Math.floor(gameCount / 100) * 100}+ games` : 'Browse games';
  const stepCovers = data.trending.filter((g) => g.coverImageId).slice(0, 3);

  return (
    <>
      <JsonLd data={landingJsonLd(release)} />

      {/* Hero: headline pane + the live split screen */}
      <section className="lp-hero" aria-labelledby="hero-title">
        <div className="pane lp-hero-copy">
          <h1 id="hero-title" className="display">
            Split-screen for PC games that never had it.
          </h1>
          <p className="lede">
            Nucleus Co-op runs one copy of the game for each player, gives every controller its own window and tiles
            the windows on your screen. Free and open source.
          </p>
          <div className="lp-hero-cta">
            <LinkButton href={paths.download()} variant="primary" size="lg" icon="download">
              Download for Windows
            </LinkButton>
            <LinkButton href={paths.hub()} variant="ghost" size="lg">
              {browseLabel}
            </LinkButton>
          </div>
          <div className="lp-hero-foot">
            <span className="tags" aria-hidden="true">
              {[1, 2, 3, 4].map((p) => (
                <PlayerTag key={p} player={p} />
              ))}
            </span>
            <span>One PC, one copy of the game, a screen for everyone.</span>
          </div>
        </div>
        <SplitTv scenes={scenes} />
      </section>

      {/* How it works */}
      <section className="pane lp-how" id="how" aria-labelledby="how-title">
        <div className="lp-how-head">
          <h2 id="how-title" className="h1">
            From couch to <span className="whitespace-nowrap">split-screen</span> in three steps
          </h2>
          <p className="muted">
            No mods to hunt down and no config files. Handlers written by the community do the hard part for each
            game.
          </p>
        </div>
        <ol className="lp-steps">
          <li>
            <span className="n" aria-hidden="true">
              1
            </span>
            <h3 className="h3">Pick a game</h3>
            <p>Nucleus finds the games installed on your PC and matches them with handlers from the hub.</p>
            <div className="lp-step-visual" aria-hidden="true">
              {stepCovers.map((g) => (
                <span key={g.slug} className="lp-mini-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- IGDB art, served as is */}
                  <img src={igdbCoverUrl(g.coverImageId, 't_cover_small')!} alt="" width={44} height={59} loading="lazy" />
                </span>
              ))}
            </div>
          </li>
          <li>
            <span className="n" aria-hidden="true">
              2
            </span>
            <h3 className="h3">Everyone presses a button to join</h3>
            <p>Each controller, keyboard or mouse claims the next free screen. Drag players around for a different seat.</p>
            <div className="lp-step-visual" aria-hidden="true">
              <div className="lp-join-row">
                {(['pad', 'pad', 'kbm'] as const).map((device, i) => (
                  <span key={i} className={`lp-join-slot p${i + 1}`}>
                    <Icon name={device} />
                    <PlayerTag player={i + 1} />
                  </span>
                ))}
                <span className="lp-join-slot is-empty">
                  <span>Press any button</span>
                </span>
              </div>
            </div>
          </li>
          <li>
            <span className="n" aria-hidden="true">
              3
            </span>
            <h3 className="h3">Launch</h3>
            <p>Nucleus opens one copy per player, connects them together and arranges the windows into a split screen.</p>
            <div className="lp-step-visual" aria-hidden="true">
              <div className="lp-mini-layouts">
                <Icon name="layout-2h" />
                <Icon name="layout-3" />
                <Icon name="layout-4" />
              </div>
            </div>
          </li>
        </ol>
      </section>

      {/* Trending + collections */}
      <div className="lp-row-trend">
        <section className="pane pad" aria-labelledby="trend-title">
          <div className="pane-head">
            <h2 id="trend-title" className="h2">
              Trending on the hub
            </h2>
            <Link href={paths.hub()}>See all games</Link>
          </div>
          {data.trending.length > 0 ? (
            <ol className="lp-trend-grid">
              {data.trending.map((g, i) => (
                <li key={g.slug}>
                  <GameCard game={g} rank={i + 1} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              The hub is taking a break. <Link href={paths.hub()}>Browse the games</Link> in a moment.
            </p>
          )}
        </section>

        <section className="pane pad lp-collections" aria-labelledby="coll-title">
          <div className="pane-head">
            <h2 id="coll-title" className="h2">
              Find your kind of night
            </h2>
          </div>
          {data.collections.length > 0 && (
            <ul className="lp-coll-list">
              {data.collections.map((c) => (
                <li key={c.key}>
                  <span className="lp-collage">
                    {c.games.slice(0, 3).map((g) => (
                      <Link key={g.slug} href={paths.game(g.slug)} aria-label={g.name} tabIndex={-1}>
                        {g.coverImageId && (
                          // eslint-disable-next-line @next/next/no-img-element -- IGDB art, served as is
                          <img src={igdbCoverUrl(g.coverImageId, 't_cover_small')!} alt="" width={46} height={62} loading="lazy" />
                        )}
                      </Link>
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="lp-coll-name">{c.name}</span>
                    <br />
                    <span className="lp-coll-blurb">{c.blurb}</span>
                    <span className="lp-coll-games block">
                      {c.games.slice(0, 4).map((g, i) => (
                        <span key={g.slug}>
                          {i > 0 && ' · '}
                          <Link href={paths.game(g.slug)}>{g.name}</Link>
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="lp-coll-count data">{c.games.length} games</span>
                </li>
              ))}
            </ul>
          )}
          <div className="lp-missing">
            <div>
              <h3>Missing a game?</h3>
              <p>Handler writers take requests. Tell them what you want to play and how many of you there are.</p>
              <LinkButton href={COMMUNITY.discord} variant="ghost" size="sm" icon="discord">
                Request it on Discord
              </LinkButton>
            </div>
          </div>
        </section>
      </div>

      {/* Creators + under the hood */}
      <div className="lp-row-make">
        <section className="pane pad" id="creators" aria-labelledby="creators-title">
          <div className="pane-head">
            <h2 id="creators-title" className="h2">
              Made by players
            </h2>
          </div>
          <p className="muted lp-creators-intro">
            Every handler is a small script written by someone who wanted to play a game with a friend. These are the
            people behind most of them.
          </p>
          {data.authors.length > 0 && (
            <ol className="lp-creators-list">
              {data.authors.map((a) => (
                <li key={a.id}>
                  <Link href={paths.author(a.username)}>
                    <span className="lp-mono-av" aria-hidden="true">
                      {a.username.replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="lp-who-name">{a.username}</span>
                    <span className="data">
                      <b>{nf.format(a.handlers)}</b> handler{a.handlers > 1 ? 's' : ''}
                    </span>
                    <span className="data dl">
                      <b>{formatCount(a.downloads)}</b> downloads
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <div className="lp-creators-cta">
            <LinkButton href={paths.doc('handlers/create')} variant="ghost" icon="code">
              Write your first handler
            </LinkButton>
            <Link className="lp-link" href={paths.doc('handlers')}>
              What handlers are
            </Link>
          </div>
        </section>

        <section className="pane pad" aria-labelledby="hood-title">
          <div className="pane-head">
            <h2 id="hood-title" className="h2">
              What Nucleus does when you press Launch
            </h2>
          </div>
          <div className="lp-hood-grid">
            <div className="lp-hood-item">
              <Icon name="layers" />
              <h3>One copy per player</h3>
              <p>
                The game runs several times from a single installation. Each copy gets its own save folder and settings,
                so nobody overwrites anybody.
              </p>
            </div>
            <div className="lp-hood-item">
              <Icon name="pad" />
              <h3>Every device goes to one window</h3>
              <p>
                Controllers, keyboards and mice are routed to their player&apos;s copy only, even when the game expects a
                single input.
              </p>
            </div>
            <div className="lp-hood-item">
              <Icon name="layout-4" />
              <h3>Windows tiled on your screens</h3>
              <p>
                Copies are resized and placed into a split layout across one or several monitors, for up to 32 players.
              </p>
            </div>
            <div className="lp-hood-item">
              <Icon name="network" />
              <h3>Copies find each other</h3>
              <p>
                LAN and network emulation let the copies see one another as if they were on separate PCs, so the
                game&apos;s own co-op does the rest.
              </p>
            </div>
          </div>
          <p className="lp-hood-note">
            <Icon name="info" />
            <span>
              <b>One thing Nucleus can&apos;t do:</b> add multiplayer to a game that has none. The game must already
              support LAN, online or modded multiplayer.
            </span>
          </p>
        </section>
      </div>

      {/* FAQ + download */}
      <div className="lp-row-end">
        <section className="pane pad lp-faq" aria-labelledby="faq-title">
          <div className="pane-head">
            <h2 id="faq-title" className="h2">
              Questions people ask first
            </h2>
            <Link href={paths.doc('faq')}>All questions</Link>
          </div>
          {landingFaq.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>
                {item.q}
                <Icon name="plus" />
              </summary>
              <p>
                {item.a} <Link href={item.href}>Read more</Link>
              </p>
            </details>
          ))}
        </section>

        <section className="pane pad lp-download" id="download" aria-labelledby="dl-title">
          <span className="ver">
            <LogoMark />
            {release.channel === 'beta' && <span className="lp-beta">Beta</span>}
            <span>Released {releaseMonth()}</span>
          </span>
          <h2 id="dl-title" className="h1">
            Nucleus <span className="whitespace-nowrap">Co-op {release.label}</span>
          </h2>
          <p className="sub">
            Free for Windows 10 and 11, 64-bit, {releaseSize()}. Unzip it and play: no installer, no account.
          </p>
          <LinkButton href={release.downloadUrl} download size="lg" icon="download" className="btn-dark">
            {release.channel === 'beta' ? 'Download the beta' : 'Download for Windows'}
          </LinkButton>
          <div className="links">
            {release.notesUrl && (
              <a href={release.notesUrl} rel="noopener">
                Release notes
              </a>
            )}
            <Link href={paths.doc('getting-started/install')}>Install guide</Link>
            {release.channel === 'beta' && stableRelease.notesUrl && (
              <a href={stableRelease.notesUrl} rel="noopener">
                Stable {stableRelease.label}
              </a>
            )}
            <a href={COMMUNITY.github} rel="noopener">
              Source code on GitHub
            </a>
          </div>
          {release.channel === 'beta' && (
            <p className="preview">
              <b>Nucleus Co-op 3 is in beta</b>, with the new couch-friendly interface. Prefer the stable{' '}
              {stableRelease.label}? It&apos;s on GitHub, and the <Link href={paths.download()}>download page</Link>{' '}
              has the details.
            </p>
          )}
          <ul className="lp-reqs">
            <li>
              <Icon name="check" />
              Windows 10 or 11, 64-bit
            </li>
            <li>
              <Icon name="check" />
              The game installed once, from Steam or another store
            </li>
            <li>
              <Icon name="check" />
              One controller, or keyboard and mouse, per player
            </li>
            <li>
              <Icon name="check" />
              <span>
                Something wrong? <Link href={paths.doc('troubleshooting')}>Troubleshooting</Link>
              </span>
            </li>
          </ul>
          {data.stats && (
            <dl className="lp-dl-stats">
              <div>
                <dt>handler downloads</dt>
                <dd>{formatCount(data.stats.downloads)}</dd>
              </div>
              <div>
                <dt>games</dt>
                <dd>{nf.format(data.stats.games)}</dd>
              </div>
              <div>
                <dt>members</dt>
                <dd>{nf.format(data.stats.members)}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>
    </>
  );
}
