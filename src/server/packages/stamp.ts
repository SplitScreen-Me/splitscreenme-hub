/**
 * Stamps handler.js with the hub facts the desktop app reads for update checks (docs/ARCHITECTURE.md
 * section 6.3, step 6): previous Hub.* lines are removed, the four lines are prepended, and the file's
 * own line endings are kept.
 */

const HUB_LINE = /^[ \t]*Hub\.(?:Handler\.(?:Id|Version)|Maintainer\.(?:Id|Name))[ \t]*=.*(?:\r?\n|$)/gm;

export interface StampFacts {
  version: number;
  handlerId: string;
  ownerName: string;
  ownerId: string;
  siteUrl: string;
  date: Date;
}

export function stampScript(script: string, facts: StampFacts): string {
  const eol = script.includes('\r\n') ? '\r\n' : '\n';
  const body = script.replace(HUB_LINE, '');
  const header = [
    `Hub.Handler.Version = ${facts.version}; // Released at ${facts.siteUrl} on ${facts.date.toISOString()}.`,
    `Hub.Handler.Id = ${JSON.stringify(facts.handlerId)};`,
    `Hub.Maintainer.Name = ${JSON.stringify(facts.ownerName)};`,
    `Hub.Maintainer.Id = ${JSON.stringify(facts.ownerId)};`,
  ].join(eol);
  return `${header}${eol}${eol}${body}`;
}

/** handler.js must name the game for the app: `Game.GameName = ...` or `Game.ExecutableName = ...`. */
export const declaresGame = (script: string) => /\bGame\s*\.\s*(?:GameName|ExecutableName)\s*=/.test(script);
