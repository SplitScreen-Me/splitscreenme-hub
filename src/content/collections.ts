/**
 * "Find your kind of night" on the landing: hand-picked groups of games. Each game is matched against the
 * public catalogue by slug, then by name (slugs can change when a game is refreshed from IGDB); games without
 * a listed handler are skipped, and a collection with fewer than two games left is not shown.
 */
export interface Collection {
  key: string;
  name: string;
  blurb: string;
  games: { slug: string; name: string }[];
}

export const collections: Collection[] = [
  {
    key: 'zombies',
    name: 'Zombie co-op',
    blurb: 'Hold the line together.',
    games: [
      { slug: 'left-4-dead-2', name: 'Left 4 Dead 2' },
      { slug: 'call-of-duty-black-ops-ii', name: 'Call of Duty: Black Ops II' },
      { slug: 'world-war-z-aftermath', name: 'World War Z: Aftermath' },
      { slug: 'dying-light', name: 'Dying Light' },
      { slug: 'resident-evil-5', name: 'Resident Evil 5' },
      { slug: 'call-of-duty-world-at-war', name: 'Call of Duty: World at War' },
      { slug: 'dying-light-the-beast', name: 'Dying Light: The Beast' },
      { slug: 'project-zomboid', name: 'Project Zomboid' },
      { slug: 'killing-floor-2', name: 'Killing Floor 2' },
      { slug: '7-days-to-die', name: '7 Days to Die' },
    ],
  },
  {
    key: 'survival',
    name: 'Survival & crafting',
    blurb: 'Build a base, share the night.',
    games: [
      { slug: 'minecraft', name: 'Minecraft' },
      { slug: 'valheim', name: 'Valheim' },
      { slug: 'terraria', name: 'Terraria' },
      { slug: 'don-t-starve-together', name: "Don't Starve Together" },
      { slug: 'palworld', name: 'Palworld' },
      { slug: 'sons-of-the-forest', name: 'Sons of the Forest' },
      { slug: 'the-forest', name: 'The Forest' },
      { slug: 'raft', name: 'Raft' },
      { slug: 'stardew-valley', name: 'Stardew Valley' },
    ],
  },
  {
    key: 'soulslike',
    name: 'Seamless co-op',
    blurb: 'Hard games are better with a friend.',
    games: [
      { slug: 'elden-ring', name: 'Elden Ring' },
      { slug: 'dark-souls-iii', name: 'Dark Souls III' },
      { slug: 'dark-souls-remastered', name: 'Dark Souls: Remastered' },
      { slug: 'hollow-knight', name: 'Hollow Knight' },
      { slug: 'remnant-from-the-ashes', name: 'Remnant: From the Ashes' },
      { slug: 'lords-of-the-fallen', name: 'Lords of the Fallen' },
      { slug: 'monster-hunter-world', name: 'Monster Hunter: World' },
    ],
  },
  {
    key: 'shooters',
    name: 'Shooters',
    blurb: 'Classic local deathmatch nights.',
    games: [
      { slug: 'halo-the-master-chief-collection', name: 'Halo: The Master Chief Collection' },
      { slug: 'borderlands-2', name: 'Borderlands 2' },
      { slug: 'call-of-duty-black-ops', name: 'Call of Duty: Black Ops' },
      { slug: 'call-of-duty-modern-warfare-2', name: 'Call of Duty: Modern Warfare 2' },
      { slug: 'payday-2', name: 'Payday 2' },
      { slug: 'borderlands-3', name: 'Borderlands 3' },
      { slug: 'deep-rock-galactic', name: 'Deep Rock Galactic' },
      { slug: 'halo-infinite', name: 'Halo Infinite' },
    ],
  },
  {
    key: 'party',
    name: 'Party chaos',
    blurb: 'Loud, short, ridiculous.',
    games: [
      { slug: 'peak', name: 'Peak' },
      { slug: 'lethal-company', name: 'Lethal Company' },
      { slug: 'content-warning', name: 'Content Warning' },
      { slug: 'rv-there-yet', name: 'RV There Yet?' },
      { slug: 'escape-the-backrooms', name: 'Escape the Backrooms' },
      { slug: 'human-fall-flat', name: 'Human: Fall Flat' },
      { slug: 'risk-of-rain-2', name: 'Risk of Rain 2' },
    ],
  },
];

/**
 * The hero's split screen: one scene per game, art from its Steam library hero image. Steam app ids are public
 * store ids; `slug`/`name` link the scene to its game page when the game is on the hub.
 */
export const heroScenes: { slug: string; name: string; steamAppId: number }[] = [
  { slug: 'elden-ring', name: 'Elden Ring', steamAppId: 1245620 },
  { slug: 'left-4-dead-2', name: 'Left 4 Dead 2', steamAppId: 550 },
  { slug: 'valheim', name: 'Valheim', steamAppId: 892970 },
  { slug: 'don-t-starve-together', name: "Don't Starve Together", steamAppId: 322330 },
];

/** The landing FAQ: short answers, each with a link to the full docs page. */
export const landingFaq: { q: string; a: string; href: string }[] = [
  {
    q: 'Is it free?',
    a: 'Yes. Nucleus Co-op and every handler on the hub are free. The project is open source under GPL-3.0 and run by volunteers: no account, no ads, no catch.',
    href: '/doc/faq#is-it-free',
  },
  {
    q: 'Do I need several copies of the game?',
    a: 'No. Nucleus Co-op runs one copy per player from a single installation. A few online games still need one account per player, and their handler notes say so.',
    href: '/doc/play/supported-games',
  },
  {
    q: 'Does it work with Steam and Epic games?',
    a: 'Yes. Most handlers are made for the Steam version of a game, and Nucleus finds the games installed through Steam and Epic by itself. Xbox app and Game Pass versions are not supported.',
    href: '/doc/play/supported-games#which-version-of-the-game',
  },
  {
    q: 'Can every player use a keyboard and mouse?',
    a: 'On games whose handler supports it, yes: Nucleus gives each keyboard and mouse to its own player. Each game page says which inputs work.',
    href: '/doc/play/keyboard-and-mouse',
  },
  {
    q: 'What PC do I need?',
    a: 'A 64-bit Windows 10 or 11 PC that runs the game comfortably, with memory for one copy per player. As a rule of thumb, plan for the game’s recommended specs plus half again per extra player.',
    href: '/doc/getting-started/system-requirements',
  },
];
