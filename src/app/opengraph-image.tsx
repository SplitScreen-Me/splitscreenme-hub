import { ImageResponse } from 'next/og';

/**
 * Default Open Graph image (landing, docs, every page without its own): the bezel, a split screen of four
 * player panes, the headline. Static content, so it is rendered once and cached for a day.
 */
export const alt = 'SplitScreen.Me: split-screen for PC games that never had it';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 86400;

const PLAYERS = ['#ff6b35', '#3b8bff', '#ffcf3a', '#3ddb86'];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#000', padding: 24, gap: 12 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: 600,
            padding: '56px 52px',
            borderRadius: 28,
            background: '#14171e',
            color: '#f3f4f6',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, fontWeight: 800 }}>
            <svg width="44" height="44" viewBox="0 0 32 32">
              <rect x="2" y="3" width="28" height="12.5" rx="3.4" fill="#f3f4f6" />
              <rect x="2" y="17.5" width="13" height="11.5" rx="3.4" fill="#f3f4f6" />
              <circle cx="23.5" cy="23.25" r="5.75" fill="#f3f4f6" />
            </svg>
            <span>
              SplitScreen<span style={{ color: '#6b7383' }}>.Me</span>
            </span>
          </div>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
            Split-screen for PC games that never had it.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, color: '#a3abba' }}>
            {PLAYERS.map((c, i) => (
              <span
                key={c}
                style={{
                  display: 'flex',
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: c,
                  color: '#07080a',
                  fontWeight: 800,
                  fontSize: 22,
                }}
              >
                P{i + 1}
              </span>
            ))}
            <span style={{ marginLeft: 8 }}>Free and open source · Nucleus Co-op</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, gap: 12 }}>
          {PLAYERS.map((c) => (
            <div
              key={c}
              style={{
                display: 'flex',
                width: 270,
                height: 285,
                borderRadius: 22,
                background: '#1b1f28',
                border: `4px solid ${c}`,
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
