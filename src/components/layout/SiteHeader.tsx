import Link from 'next/link';
import { Field, Icon, LinkButton, Logo } from '@/components/ui';
import { getCurrentUser, hasRole } from '@/lib/auth/current-user';
import { paths } from '@/lib/urls';
import { logout } from '@/server/actions/session';
import { MainNav, MobileNav } from './Nav';

export const NAV_ITEMS = [
  { href: '/hub', label: 'Games' },
  { href: '/#how', label: 'How it works' },
  { href: '/#creators', label: 'Creators' },
  { href: '/doc', label: 'Docs' },
] as const;

/** The header sits on the bezel itself, not in a pane: the top edge of the screen. */
export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="site-head">
      <Logo />
      <MainNav items={NAV_ITEMS} />
      <div className="site-actions">
        <form action="/hub" method="get" role="search" className="site-search">
          <Field
            icon="search"
            type="search"
            name="q"
            placeholder="Search 600+ games"
            aria-label="Search games"
            className="h-full"
          />
        </form>
        <LinkButton href={paths.download()} variant="primary" size="sm" icon="download">
          Download
        </LinkButton>
        {user ? (
          <details className="menu">
            <summary className="btn btn-ghost btn-sm" aria-label="Account menu">
              <Icon name="user" />
              <span className="max-w-[12ch] truncate">{user.username}</span>
            </summary>
            <div className="menu-panel">
              <p className="menu-head">Signed in as {user.username}</p>
              <Link href={paths.account()}>
                <Icon name="user" /> Account
              </Link>
              <Link href={paths.dashboard()}>
                <Icon name="library" /> Dashboard
              </Link>
              {hasRole(user, 'moderator') && (
                <Link href={paths.admin()}>
                  <Icon name="sliders" /> Admin
                </Link>
              )}
              <hr />
              <form action={logout}>
                <button type="submit">
                  <Icon name="arrow-l" /> Log out
                </button>
              </form>
            </div>
          </details>
        ) : (
          <>
            <LinkButton href={paths.login()} variant="ghost" size="sm" className="hidden sm:inline-flex">
              Log in
            </LinkButton>
            <LinkButton href={paths.register()} variant="ghost" size="sm" className="hidden md:inline-flex">
              Register
            </LinkButton>
          </>
        )}
        <MobileNav items={NAV_ITEMS} signedIn={!!user} />
      </div>
    </header>
  );
}
