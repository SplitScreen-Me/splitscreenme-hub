import { ImageResponse } from 'next/og';
import { cachedPng, loadOgFonts, fetchImageDataUrl, OG_COLORS } from '@/components/hub/og';
import { igdbImageUrl } from '@/lib/urls';
import { getGameBySlug, isLookupSlug } from '@/server/public';

export const alt = 'How to play this game split screen on PC with Nucleus Co-op';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// Rendered on request and kept in memory by game data (cachedPng), never written as ISR files: a
// per-slug cache on disk would grow with every probed URL.
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

const PLAYER_COLORS = [
  '#ff6b35',
  '#3b8bff',
  '#ffcf3a',
  '#3ddb86',
  '#ff5db1',
  '#9b7cff',
  '#23d3d3',
  '#c4eb45',
];

/** Input glyphs as small SVG paths (same 24x24 set as the site icons). */
const INPUT_ICONS = {
  controllers:
    'M7.5 5h9a5 5 0 0 1 4.9 4l1 5.3a3 3 0 0 1-5.2 2.6L15.5 15h-7l-1.7 1.9a3 3 0 0 1-5.2-2.6l1-5.3A5 5 0 0 1 7.5 5zM6.5 10h4M8.5 8v4M15.5 9.5h.01M17.5 11.5h.01',
  keyboardMouse:
    'M3 8h11a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 14 17H3a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 3 8zM5 11h.01M8.5 11h.01M12 11h.01M5.5 14h6.5M20 7a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0v-5A2.5 2.5 0 0 1 20 7z',
  multiKeyboardMouse:
    'M6 8.5V5.5A1.5 1.5 0 0 1 7.5 4h13A1.5 1.5 0 0 1 22 5.5v6a1.5 1.5 0 0 1-1.5 1.5H18M3.5 9h13A1.5 1.5 0 0 1 18 10.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 18.5v-8A1.5 1.5 0 0 1 3.5 9zM5.5 13h.01M9 13h.01M12.5 13h.01M6 16.5h7',
} as const;

/**
 * Open Graph image of a game page (1200x630): bezel frame, IGDB cover, game name, "Split-screen on PC · up
 * to N players", input icons and player colours. Without a reachable cover it renders text only.
 * Only public games get one (404 otherwise), so random slugs cost a cached lookup, not a render.
 */
export default async function Image({ params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  const lookup = isLookupSlug(slug) ? await getGameBySlug(slug) : null;
  if (lookup?.kind !== 'game') {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const game = lookup.game;
  const primary = game.handlers[0];
  const name = game.name;
  const players = primary?.maxPlayers ?? 4;
  const inputs = primary
    ? (Object.keys(INPUT_ICONS) as (keyof typeof INPUT_ICONS)[]).filter((k) => primary.inputs[k])
    : [];
  const key = JSON.stringify([game.id, name, game.coverImageId, players, inputs]);
  const png = await cachedPng(key, async () => {
    const [fonts, cover] = await Promise.all([
      loadOgFonts(),
      game.coverImageId ? fetchImageDataUrl(igdbImageUrl(game.coverImageId, 't_cover_big')) : null,
    ]);
    // A cover that failed to load is retried after 10 minutes instead of a day.
    const ttlMs = game.coverImageId && !cover ? 10 * 60_000 : undefined;
    return { response: render({ fonts, cover, name, players, inputs }), ttlMs };
  });
  return new Response(png, { headers: { 'content-type': contentType, 'cache-control': CACHE_CONTROL } });
}

function render({
  fonts,
  cover,
  name,
  players,
  inputs,
}: {
  fonts: Awaited<ReturnType<typeof loadOgFonts>>;
  cover: string | null;
  name: string;
  players: number;
  inputs: (keyof typeof INPUT_ICONS)[];
}): Response {
  const nameSize = name.length > 40 ? 52 : name.length > 24 ? 64 : 80;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: OG_COLORS.bezel,
        padding: 16,
        fontFamily: 'Archivo',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: OG_COLORS.pane,
            borderRadius: 24,
            padding: '48px 56px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="40" height="40" viewBox="0 0 32 32">
              <rect x="2" y="3" width="28" height="12.5" rx="3.4" fill={PLAYER_COLORS[0]} />
              <rect x="2" y="17.5" width="13" height="11.5" rx="3.4" fill={PLAYER_COLORS[1]} />
              <circle cx="23.5" cy="23.25" r="5.75" fill={PLAYER_COLORS[2]} />
            </svg>
            <div
              style={{ display: 'flex', fontSize: 28, fontFamily: 'Archivo Expanded', color: OG_COLORS.ink }}
            >
              SplitScreen<span style={{ color: OG_COLORS.ink3 }}>.Me</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                display: 'flex',
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: OG_COLORS.ink3,
              }}
            >
              Split-screen on PC
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: nameSize,
                lineHeight: 1.02,
                fontFamily: 'Archivo Expanded',
                color: OG_COLORS.ink,
                letterSpacing: -1,
              }}
            >
              {name}
            </div>
            <div style={{ display: 'flex', fontSize: 30, color: OG_COLORS.ink2 }}>
              {players >= 2 ? `Up to ${players} players on one PC` : 'Play together on one PC'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {Array.from({ length: Math.max(1, Math.min(players, 8)) }, (_, i) => (
                <div
                  key={i}
                  style={{ width: 12, height: 32, borderRadius: 4, background: PLAYER_COLORS[i] }}
                />
              ))}
            </div>
            {inputs.map((k) => (
              <svg
                key={k}
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke={OG_COLORS.ink2}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={INPUT_ICONS[k]} />
              </svg>
            ))}
            <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 24, color: OG_COLORS.ink3 }}>
              Free with Nucleus Co-op
            </div>
          </div>
        </div>
        {cover && (
          <div
            style={{
              width: 448,
              display: 'flex',
              borderRadius: 24,
              overflow: 'hidden',
              background: OG_COLORS.pane,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
            <img src={cover} width={448} height={598} alt="" style={{ objectFit: 'cover' }} />
          </div>
        )}
      </div>
    </div>,
    { ...size, fonts },
  );
}
