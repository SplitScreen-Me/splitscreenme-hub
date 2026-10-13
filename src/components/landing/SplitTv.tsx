'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface TvScene {
  name: string;
  /** hero art */
  image: string;
  /** game page, when the game is on the hub */
  href?: string;
}

/** The demo players: one per colour, in join order. Names are invented. */
const PLAYERS = [
  { name: 'Mika', device: 'pad' },
  { name: 'Jules', device: 'pad' },
  { name: 'Sam', device: 'kbm' },
  { name: 'Noor', device: 'pad' },
] as const;

/** Same game in every pane, framed differently: each player has their own camera. */
const VIEWS = [
  { pos: '50% 45%', scale: 1 },
  { pos: '12% 62%', scale: 1.55 },
  { pos: '66% 86%', scale: 1.9 },
  { pos: '90% 28%', scale: 1.4 },
];

type Rect = [x: number, y: number, w: number, h: number];
/** Rects as fractions; hidden panes sit collapsed on the edge they grow from. */
const LAYOUTS: Record<number, Rect[]> = {
  1: [[0, 0, 1, 1], [1, 0, 0, 1], [0, 1, 1, 0], [1, 0.5, 0, 0.5]],
  2: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1], [0, 1, 1, 0], [1, 0.5, 0, 0.5]],
  3: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1, 0.5], [1, 0.5, 0, 0.5]],
  4: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
};

const JOIN_GAP = [600, 550, 550]; // before P2, P3, P4 join
const HOLD = 3400; // all four on screen

const G = 'var(--gutter)';
// Inner edges leave half a gutter on each side, so the black page gutter shows between panes.
const start = (v: number) => `${v * 100}%${v > 0 && v < 1 ? ` + ${G} / 2` : ''}`;
const end = (v: number) => `${v * 100}%${v > 0 && v < 1 ? ` - ${G} / 2` : ''}`;

function rectStyle([x, y, w, h]: Rect, on: boolean, i: number): CSSProperties {
  return {
    left: `calc(${start(x)})`,
    top: `calc(${start(y)})`,
    width: `max(0px, calc(${end(x + w)} - (${start(x)})))`,
    height: `max(0px, calc(${end(y + h)} - (${start(y)})))`,
    opacity: on ? 1 : 0,
    ['--pc' as string]: `var(--p${i + 1})`,
  };
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** False on the server and during hydration, then the media query (and its changes). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * The landing's live split screen (mockup web/index.html): players join one by one, the screen splits for each,
 * then the next game. Server-rendered with all four players in place, so it reads well without JavaScript and
 * with reduced motion; the animation starts after hydration.
 */
export function SplitTv({ scenes }: { scenes: TvScene[] }) {
  const reduced = usePrefersReducedMotion();
  const [started, setStarted] = useState(false);
  const [players, setPlayers] = useState(4);
  const [scene, setScene] = useState(0);
  const [shown, setShown] = useState(0); // scene whose art is on screen (lags `scene` during the swap)
  const [joined, setJoined] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [bump, setBump] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Preload the art so scene changes never flash.
  useEffect(() => {
    for (const s of scenes) {
      const img = new Image();
      img.src = s.image;
    }
  }, [scenes]);

  // Start: one player, then the timeline. Deliberately after hydration: the server and the first client render
  // show all four players, so the page reads the same without JavaScript.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- starts the animation once hydrated (see above) */
    if (reduced || scenes.length === 0) {
      setPlayers(4);
      setStarted(false);
      return;
    }
    setPlayers(1);
    setJoined(0);
    setStarted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [reduced, scenes.length]);

  useEffect(() => {
    if (!started || paused || reduced) return;
    const delay = players < 4 ? JOIN_GAP[players - 1]! : HOLD;
    timer.current = setTimeout(() => {
      if (players < 4) {
        setPlayers(players + 1);
        setJoined(players);
      } else {
        const next = (scene + 1) % scenes.length;
        setPlayers(1);
        setJoined(-1);
        setScene(next);
        setTimeout(() => setShown(next), 280);
        setTimeout(() => setJoined(0), 260);
      }
      setBump((b) => b + 1);
    }, delay);
    return () => clearTimeout(timer.current);
  }, [started, paused, reduced, players, scene, scenes.length]);

  if (scenes.length === 0) return null;
  const current = scenes[scene]!;
  const art = scenes[shown]!.image;
  const swapping = shown !== scene;
  const n = players;

  return (
    <figure className="lp-tv" aria-label="Animated example: players join one by one and the screen splits for each of them">
      <figcaption className="sr-only">
        Example sessions from the hub: {scenes.map((s) => s.name).join(', ')}, split for up to four players on one
        PC.
      </figcaption>
      <div className="lp-tv-chip">
        {current.href ? (
          <Link href={current.href} className="lp-tv-game">
            {current.name}
          </Link>
        ) : (
          <span className="lp-tv-game">{current.name}</span>
        )}
        <span key={bump} className={`data${started ? ' is-bump' : ''}`}>
          {n} player{n > 1 ? 's' : ''}
        </span>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play animation' : 'Pause animation'}
            aria-pressed={paused}
          >
            {paused ? (
              <Icon name="play" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
      </div>
      {PLAYERS.map((p, i) => {
        const on = i < n;
        const view = VIEWS[i]!;
        return (
          <div
            key={p.name}
            aria-hidden="true"
            className={`lp-tv-screen${on ? '' : ' is-off'}${joined === i ? ' just-joined' : ''}`}
            style={rectStyle(LAYOUTS[n]![i]!, on, i)}
          >
            <div className={`lp-tv-cam lp-cam-${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- third-party art, served as is */}
              <img
                src={art}
                alt=""
                className={swapping ? 'is-swapping' : undefined}
                style={{ objectPosition: view.pos, transformOrigin: view.pos, transform: `scale(${view.scale})` }}
              />
            </div>
            <span className="lp-tv-who">
              <span className="ptag">P{i + 1}</span>
              {p.name}
              <Icon name={p.device} />
            </span>
            <span className="lp-tv-joined">
              <span className="lp-tv-slam">
                <span className="ptag">P{i + 1}</span>joined
              </span>
            </span>
          </div>
        );
      })}
    </figure>
  );
}
