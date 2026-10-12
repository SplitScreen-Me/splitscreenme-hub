import type { Inputs, PublicGame, PublicHandler } from '@/server/public/types';
import { genreLabel } from '../genres';
import { absoluteUrl, igdbCoverUrl, paths, steamStoreUrl } from '../urls';
import { pageTitle } from './metadata';

/**
 * SEO builders of the game and handler pages (docs/ARCHITECTURE.md section 7). Pure functions:
 * the page renders the same steps and facts that the JSON-LD describes.
 */

export const META_DESCRIPTION_MAX = 155;

/** "a", "a or b", "a, b or c" */
export function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/** The inputs a handler supports, in reading order ("controllers", "keyboard and mouse", ...). */
export function inputNames(inputs: Inputs): string[] {
  return [
    inputs.controllers && 'controllers',
    inputs.keyboardMouse && 'keyboard and mouse',
    inputs.multiKeyboardMouse && 'several keyboards and mice',
  ].filter((x): x is string => !!x);
}

/** "with controllers or keyboard and mouse", or '' when the handler says nothing about inputs. */
export function inputPhrase(inputs: Inputs): string {
  const names = inputNames(inputs);
  return names.length ? `with ${joinOr(names)}` : '';
}

/** "up to 4 players" (or "with friends" for the rare handler that declares fewer than 2). */
export const playersPhrase = (maxPlayers: number) =>
  maxPlayers >= 2 ? `up to ${maxPlayers} players` : 'friends';

/** H2 of the steps and base of the `<title>`: the query the page answers. */
export const howToHeading = (gameName: string) => `How to play ${gameName} split screen on PC`;

/** `<title>` of a game page; the site suffix is dropped above 60 characters. */
export const gamePageTitle = (gameName: string) => pageTitle(howToHeading(gameName));

/** `<title>` of a non-primary handler page. */
export const handlerPageTitle = (handlerTitle: string, gameName: string) =>
  pageTitle(
    handlerTitle.toLowerCase().includes(gameName.toLowerCase())
      ? `${handlerTitle}: split screen handler`
      : `${handlerTitle}: ${gameName} split screen handler`,
  );

/** Cuts at a word boundary and adds an ellipsis when `text` is longer than `max`. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/**
 * Meta description (≤155 chars): "Play <Game> in split screen on one PC with up to <N> players. Free Nucleus
 * Co-op handler by <author>, <inputs>. Step-by-step setup." Optional parts go first when it is too long.
 */
export function gameMetaDescription(
  h: Pick<PublicHandler, 'gameName' | 'maxPlayers' | 'authorName' | 'inputs'>,
) {
  const lead = `Play ${h.gameName} in split screen on one PC with ${playersPhrase(h.maxPlayers)}.`;
  const inputs = inputPhrase(h.inputs);
  const handler = `Free Nucleus Co-op handler by ${h.authorName}`;
  const candidates = [
    `${lead} ${handler}${inputs ? `, ${inputs}` : ''}. Step-by-step setup.`,
    `${lead} ${handler}${inputs ? `, ${inputs}` : ''}.`,
    `${lead} ${handler}.`,
    `${lead} Free Nucleus Co-op handler.`,
  ];
  return candidates.find((c) => c.length <= META_DESCRIPTION_MAX) ?? truncate(lead, META_DESCRIPTION_MAX);
}

/** Meta description of a non-primary handler page (≤155 chars). */
export function handlerMetaDescription(
  h: Pick<PublicHandler, 'title' | 'gameName' | 'maxPlayers' | 'authorName' | 'inputs'>,
) {
  const inputs = inputPhrase(h.inputs);
  const candidates = [
    `“${h.title}” by ${h.authorName}: a free Nucleus Co-op handler to play ${h.gameName} in split screen on one PC with ${playersPhrase(h.maxPlayers)}${inputs ? `, ${inputs}` : ''}.`,
    `“${h.title}” by ${h.authorName}: a free Nucleus Co-op handler to play ${h.gameName} in split screen on one PC.`,
    `A free Nucleus Co-op handler to play ${h.gameName} in split screen on one PC with ${playersPhrase(h.maxPlayers)}.`,
  ];
  return (
    candidates.find((c) => c.length <= META_DESCRIPTION_MAX) ?? truncate(candidates[2]!, META_DESCRIPTION_MAX)
  );
}

// ---------- the steps ----------

export interface HowToStep {
  name: string;
  text: string;
  /** a short extra hint shown under the step (and appended to the JSON-LD text) */
  tip?: string;
}

/** The 4 setup steps of the game page (mockup `web/game.html`), shared by the page and the HowTo JSON-LD. */
export function howToSteps(h: Pick<PublicHandler, 'gameName' | 'inputs'>): HowToStep[] {
  const game = h.gameName;
  const keyboardsOnly = h.inputs.controllers === false && h.inputs.multiKeyboardMouse;
  return [
    {
      name: 'Get Nucleus Co-op',
      text: 'Download Nucleus Co-op, free for Windows 10 and 11, and unzip it into its own folder, for example C:\\NucleusCo-op. There is no installer.',
      tip: 'Keep it out of Program Files, your user folder and OneDrive.',
    },
    {
      name: `Install the ${game} handler`,
      text: `In Nucleus Co-op, search the Hub for ${game} and install its handler, or download the handler file from this page and drop it on the Nucleus window. Then show Nucleus where ${game} is installed.`,
    },
    {
      name: 'Take a seat',
      text: keyboardsOnly
        ? 'Each player joins with their own keyboard and mouse and takes a spot on the screen. Pick a layout that fits your players.'
        : 'Each player presses a button on their own controller to join and takes a spot on the screen. Pick a layout that fits your players.',
      tip: h.inputs.multiKeyboardMouse
        ? 'Playing with several keyboards and mice? Press End once everything is in place to give each window its own cursor.'
        : undefined,
    },
    {
      name: 'Launch and connect',
      text: `Press Launch: Nucleus opens one copy of ${game} per player and lays the windows out on your screen. Then link them in game, usually one player hosts a LAN or online session and the others join it. The handler notes say how.`,
    },
  ];
}

// ---------- JSON-LD ----------

const SCHEMA = 'https://schema.org';

/** VideoGame for a game page. Never aggregateRating or offers: stars are not ratings. */
export function videoGameJsonLd(game: PublicGame, primary: PublicHandler, description: string) {
  const url = absoluteUrl(paths.game(game.slug));
  const sameAs = [game.igdbUrl, game.steamAppId ? steamStoreUrl(game.steamAppId) : null].filter(
    (x): x is string => !!x,
  );
  const image = igdbCoverUrl(game.coverImageId, 't_cover_big');
  return {
    '@context': SCHEMA,
    '@type': 'VideoGame',
    name: game.name,
    url,
    ...(image && { image }),
    description: game.summary ? truncate(game.summary, 500) : description,
    ...(game.genres.length && { genre: game.genres.map(genreLabel) }),
    gamePlatform: 'PC',
    operatingSystem: 'Windows',
    playMode: [`${SCHEMA}/CoOp`, `${SCHEMA}/MultiPlayer`],
    numberOfPlayers: {
      '@type': 'QuantitativeValue',
      minValue: Math.min(2, primary.maxPlayers),
      maxValue: primary.maxPlayers,
    },
    ...(sameAs.length && { sameAs }),
  };
}

/** HowTo for the steps section (`#step-n` anchors on the page at `pagePath`). */
export function howToJsonLd(gameName: string, steps: HowToStep[], pagePath: string) {
  const url = absoluteUrl(pagePath);
  return {
    '@context': SCHEMA,
    '@type': 'HowTo',
    name: howToHeading(gameName),
    url: `${url}#how-to`,
    tool: [{ '@type': 'HowToTool', name: 'Nucleus Co-op' }],
    supply: [
      { '@type': 'HowToSupply', name: `A Windows copy of ${gameName}` },
      { '@type': 'HowToSupply', name: 'One controller, or one keyboard and mouse, per player' },
    ],
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.tip ? `${s.text} ${s.tip}` : s.text,
      url: `${url}#step-${i + 1}`,
    })),
  };
}
