import { oauthStartUrl } from '@/components/auth/OAuthButtons';
import { describeUserAgent } from '@/components/account/user-agent';
import { ActionForm, CheckField, TextField } from '@/components/interactive/ActionForm';
import { Badge, DateTime, Dialog, Icon, LinkButton, Section } from '@/components/ui';
import { buttonClass } from '@/components/ui/Button';
import { requireUser } from '@/lib/auth/current-user';
import { enabledProviders } from '@/lib/auth/oauth';
import { smtpEnabled } from '@/lib/env';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import {
  changeEmailAction,
  changePasswordAction,
  changeUsernameAction,
  deleteAccountAction,
  notifyRepliesAction,
  resendVerificationAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  unlinkProviderAction,
} from '@/server/actions/account';
import { listLinkedProviders, listSessions } from '@/server/auth/account';
import { OAUTH_ERROR_MESSAGES } from '@/server/auth/oauth-resolve';
import { USERNAME_CHANGE_COOLDOWN_DAYS, USERNAME_MAX, USERNAME_MIN } from '@/server/auth/rules';

export const metadata = privatePageMetadata('Account');

const PROVIDER_LABELS: Record<string, string> = {
  discord: 'Discord',
  github: 'GitHub',
  google: 'Google',
  facebook: 'Facebook (sign-in retired)',
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; reset?: string; linked?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [linked, sessionRows] = await Promise.all([listLinkedProviders(user.id), listSessions(user.id)]);
  const mail = smtpEnabled();
  const linkable = enabledProviders().filter((p) => !linked.some((l) => l.provider === p.name));
  const oauthError = sp.error?.startsWith('oauth_') ? OAUTH_ERROR_MESSAGES[sp.error.slice(6)] : undefined;
  const canPostNow = !!user.emailVerifiedAt || user.hasOAuth;

  return (
    <>
      <section className="pane pad grid gap-3">
        <p className="micro faint font-semibold tracking-wide uppercase">Account</p>
        <h1 className="h1">{user.username}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {user.role !== 'user' && (
            <Badge tone="verified" icon="seal">
              {user.role === 'admin' ? 'Admin' : 'Moderator'}
            </Badge>
          )}
          {user.trustedAuthor && (
            <Badge tone="ok" icon="check">
              Trusted author
            </Badge>
          )}
          <span className="small muted">
            Member since <DateTime value={user.createdAt} />
          </span>
          <LinkButton href={paths.dashboard()} size="sm" icon="library">
            Your handlers
          </LinkButton>
          <LinkButton href={paths.author(user.username)} size="sm" variant="ghost">
            Public profile
          </LinkButton>
        </div>
        {sp.welcome && (
          <p role="status" className="small text-ok">
            Welcome aboard!{' '}
            {mail && !user.emailVerifiedAt && user.email ? 'Check your inbox to confirm your address.' : ''}
          </p>
        )}
        {sp.reset && (
          <p role="status" className="small text-ok">
            Password changed. Every other session was closed.
          </p>
        )}
        {sp.linked && (
          <p role="status" className="small text-ok">
            Account linked.
          </p>
        )}
        {oauthError && (
          <p role="alert" className="form-error small">
            {oauthError}
          </p>
        )}
        {!canPostNow && (
          <p className="small" role="note">
            <Icon name="info" className="inline h-4 w-4 align-[-3px]" /> To comment or publish handlers,
            confirm your email address
            {linkable.length ? ' or link one of the accounts below' : ''}.
            {!mail &&
              ' Email confirmation is not available yet: a moderator can confirm your address on request.'}
          </p>
        )}
      </section>

      <Section title="Profile" id="profile">
        <div className="grid gap-8 md:grid-cols-2">
          <ActionForm action={changeUsernameAction} submitLabel="Save username" submitVariant="default">
            <TextField
              name="username"
              label="Username"
              defaultValue={user.username}
              required
              minLength={USERNAME_MIN}
              maxLength={USERNAME_MAX}
              autoComplete="username"
              hint={`Public, shown on your handlers and comments. Once every ${USERNAME_CHANGE_COOLDOWN_DAYS} days (changing only the case is free).`}
            />
          </ActionForm>
          <div className="grid content-start gap-3">
            <ActionForm action={changeEmailAction} submitLabel="Change email" submitVariant="default">
              <TextField
                name="email"
                label="Email"
                type="email"
                defaultValue={user.email ?? ''}
                autoComplete="email"
                required
                maxLength={254}
                hint={
                  mail
                    ? 'Private. A new address is confirmed by a link before it replaces the old one.'
                    : 'Private. Never shown to anyone.'
                }
              />
              {user.hasPassword && (
                <TextField
                  name="currentPassword"
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              )}
            </ActionForm>
            <p className="small flex items-center gap-2">
              {user.email ? (
                user.emailVerifiedAt ? (
                  <Badge tone="ok" icon="check">
                    Confirmed
                  </Badge>
                ) : (
                  <Badge tone="warn" icon="warning">
                    Not confirmed
                  </Badge>
                )
              ) : (
                <Badge>No address</Badge>
              )}
            </p>
            {mail && user.email && !user.emailVerifiedAt && (
              <ActionForm
                action={resendVerificationAction}
                submitLabel="Send the confirmation link again"
                submitVariant="ghost"
                submitSize="sm"
              />
            )}
          </div>
        </div>
      </Section>

      <Section title={user.hasPassword ? 'Password' : 'Set a password'} id="password">
        <ActionForm
          action={changePasswordAction}
          submitLabel={user.hasPassword ? 'Change password' : 'Set password'}
          submitVariant="default"
          resetOnSuccess
          className="max-w-md"
        >
          {user.hasPassword ? (
            <TextField
              name="currentPassword"
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
            />
          ) : (
            <p className="small muted">
              You sign in with a linked account. A password lets you sign in with your username or email too.
            </p>
          )}
          <TextField
            name="newPassword"
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint="At least 8 characters. Other sessions are closed."
          />
          <TextField
            name="confirm"
            label="Repeat it"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </ActionForm>
      </Section>

      <Section title="Linked accounts" id="providers">
        <div className="grid gap-3">
          {linked.length === 0 && <p className="small muted">No linked account.</p>}
          <ul className="grid gap-2">
            {linked.map((l) => (
              <li
                key={l.provider}
                className="flex flex-wrap items-center justify-between gap-3 rounded-ctl bg-pane-2 px-4 py-3"
              >
                <span className="grid">
                  <span className="font-semibold">{PROVIDER_LABELS[l.provider] ?? l.provider}</span>
                  <span className="micro faint">
                    {l.providerUsername ? `${l.providerUsername} · ` : ''}linked{' '}
                    <DateTime value={l.createdAt} />
                  </span>
                </span>
                <ActionForm
                  action={unlinkProviderAction.bind(null, l.provider)}
                  inline
                  submitLabel="Unlink"
                  submitVariant="ghost"
                  submitSize="sm"
                  confirm={`Unlink ${PROVIDER_LABELS[l.provider] ?? l.provider}?`}
                />
              </li>
            ))}
          </ul>
          {linkable.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {linkable.map((p) => (
                <a
                  key={p.name}
                  href={oauthStartUrl(p.name, '/account', 'link')}
                  className={buttonClass({ size: 'sm' })}
                >
                  <Icon name="plus" /> Link {p.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Notifications" id="notifications">
        <ActionForm action={notifyRepliesAction} submitLabel="Save" submitVariant="default" submitSize="sm">
          <CheckField
            name="notifyReplies"
            defaultChecked={user.notifyReplies}
            label="Email me when someone replies to my comments"
          />
          {!mail && (
            <p className="micro faint">
              Emails are not sent yet on this site; the setting is kept for later.
            </p>
          )}
        </ActionForm>
      </Section>

      <Section
        title="Sessions"
        id="sessions"
        action={
          sessionRows.length > 1 ? (
            <ActionForm
              action={revokeOtherSessionsAction}
              inline
              submitLabel="Log out everywhere else"
              submitVariant="ghost"
              submitSize="sm"
            />
          ) : undefined
        }
      >
        <ul className="grid gap-2">
          {sessionRows.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-ctl bg-pane-2 px-4 py-3"
            >
              <span className="grid">
                <span className="font-semibold">
                  {describeUserAgent(s.userAgent)}
                  {s.id === user.sessionId && <span className="micro faint"> · this browser</span>}
                </span>
                <span className="micro faint">
                  Signed in <DateTime value={s.createdAt} />, last seen{' '}
                  <DateTime value={s.lastSeenAt} format="relative" />
                </span>
              </span>
              {s.id !== user.sessionId && (
                <ActionForm
                  action={revokeSessionAction.bind(null, s.id)}
                  inline
                  submitLabel="Log out"
                  submitVariant="ghost"
                  submitSize="sm"
                />
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Your data" id="data">
        <div className="grid gap-4">
          <p className="small muted">
            Download everything we keep about you: profile, linked accounts, sessions, handlers, comments,
            stars and reports, as JSON.
          </p>
          <div>
            <a href="/api/me/export" className={buttonClass({ size: 'sm' })} download>
              <Icon name="download" /> Export my data
            </a>
          </div>
          <div className="grid gap-2 border-t border-line pt-4">
            <h3 className="h3">Delete my account</h3>
            <p className="small muted">
              Your profile, email, password, linked accounts, sessions and stars are erased; your comments are
              removed. Handlers you published stay on the hub as &ldquo;Deleted user&rdquo;. This cannot be
              undone.
            </p>
            <div>
              <Dialog triggerLabel="Delete my account" triggerVariant="danger" title="Delete your account?">
                <ActionForm
                  action={deleteAccountAction}
                  submitLabel="Delete my account forever"
                  submitVariant="danger"
                >
                  {user.hasPassword ? (
                    <TextField
                      name="password"
                      label="Your password"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  ) : (
                    <TextField
                      name="confirmUsername"
                      label={`Type your username (${user.username}) to confirm`}
                      required
                      autoComplete="off"
                    />
                  )}
                </ActionForm>
              </Dialog>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
