import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { HowToStep } from '@/lib/seo/game';
import { apiDownloadUrl, paths } from '@/lib/urls';
import type { Inputs } from '@/server/public/types';
import { Pips } from './Pips';
import './hub.css';

/** "What works": players, the three inputs and the moderators' check, as cells of one table. */
export function CompatTable({
  maxPlayers,
  inputs,
  verified,
}: {
  maxPlayers: number;
  inputs: Inputs;
  verified: boolean;
}) {
  const cell = (on: boolean | null, icon: IconName, label: string, yes: string, no = 'Not supported') => (
    <li className={cn(on === false && 'is-no', on === null && 'is-unknown')}>
      <span className="label">{label}</span>
      <span className="value">
        <Icon name={icon} />
        {on === null ? 'Not stated' : on ? yes : no}
      </span>
    </li>
  );
  return (
    <ul className="hub-compat">
      <li>
        <span className="label">Players</span>
        <span className="value">
          <Pips count={maxPlayers} large />
        </span>
      </li>
      {cell(inputs.controllers, 'pad', 'Controllers', 'Supported')}
      {cell(inputs.keyboardMouse, 'kbm', 'Keyboard and mouse', 'Supported')}
      {cell(inputs.multiKeyboardMouse, 'multi', 'Several keyboards and mice', 'One per player')}
      {cell(verified, 'seal', 'Hub moderators', 'Verified', 'Not verified yet')}
    </ul>
  );
}

/** The numbered setup steps (ids step-1..n, the HowTo JSON-LD points at them). */
export function HowToSteps({ steps, handlerId }: { steps: HowToStep[]; handlerId: string }) {
  const extra: Record<number, ReactNode> = {
    0: (
      <p className="tip">
        <Link href={paths.download()}>Download Nucleus Co-op</Link>
      </p>
    ),
    1: (
      <p className="tip">
        <a href={apiDownloadUrl(handlerId)} rel="nofollow">
          Download the handler file (.nc)
        </a>
      </p>
    ),
  };
  return (
    <ol className="hub-steps">
      {steps.map((s, i) => (
        <li key={s.name} id={`step-${i + 1}`}>
          <h3>{s.name}</h3>
          <p>{s.text}</p>
          {s.tip && <p className="tip">{s.tip}</p>}
          {extra[i]}
        </li>
      ))}
    </ol>
  );
}

/** "What you need": the PC, the game, Nucleus Co-op and its runtimes, one input device per player. */
export function Requirements({
  gameName,
  maxPlayers,
  inputs,
}: {
  gameName: string;
  maxPlayers: number;
  inputs: Inputs;
}) {
  const devices =
    inputs.controllers === false && inputs.multiKeyboardMouse
      ? 'One keyboard and mouse per player.'
      : inputs.multiKeyboardMouse
        ? 'One controller per player, or one keyboard and mouse per player.'
        : inputs.keyboardMouse
          ? 'One controller per player; one player can use the keyboard and mouse.'
          : 'One controller per player: Xbox, PlayStation or generic pads.';
  const seats = maxPlayers >= 2 ? `${maxPlayers}` : 'several';
  return (
    <ul className="hub-needs">
      <li>
        <Icon name="monitor" />
        <div>
          <b>A Windows 10 or 11 PC</b>
          <p>
            Nucleus Co-op runs on Windows only.{' '}
            <Link href={paths.doc('getting-started/system-requirements')}>System requirements</Link>
          </p>
        </div>
      </li>
      <li>
        <Icon name="library" />
        <div>
          <b>{gameName} for Windows</b>
          <p>Installed on that PC. Nucleus starts every player&apos;s window from that one install.</p>
        </div>
      </li>
      <li>
        <Icon name="download" />
        <div>
          <b>Nucleus Co-op, free</b>
          <p>
            With .NET Framework 4.7.2 or later and the Visual C++ 2015–2022 runtimes (x86 and x64).{' '}
            <Link href={paths.download()}>Download</Link>
          </p>
        </div>
      </li>
      <li>
        <Icon name="pad" />
        <div>
          <b>Something to play with</b>
          <p>
            {devices} <Link href={paths.doc('play/controllers')}>Controllers</Link>
            {inputs.multiKeyboardMouse && (
              <>
                {' · '}
                <Link href={paths.doc('play/keyboard-and-mouse')}>Keyboards and mice</Link>
              </>
            )}
          </p>
        </div>
      </li>
      <li>
        <Icon name="users" />
        <div>
          <b>A PC that can run {seats} copies</b>
          <p>
            Each player runs their own copy of {gameName}, so the PC carries several times the usual load.
            Lower the graphics settings if it struggles.{' '}
            <Link href={paths.doc('troubleshooting/performance')}>Performance tips</Link>
          </p>
        </div>
      </li>
      <li>
        <Icon name="compass" />
        <div>
          <b>A multiplayer mode</b>
          <p>
            Nucleus links the windows through the game&apos;s own LAN or online mode; the handler takes care
            of it.
          </p>
        </div>
      </li>
    </ul>
  );
}
