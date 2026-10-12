import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { ActionForm, TextField } from '@/components/interactive/ActionForm';
import { getCurrentUser } from '@/lib/auth/current-user';
import { smtpEnabled } from '@/lib/env';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { safeNextPath } from '@/lib/urls';
import { loginAction } from '@/server/actions/auth';
import { OAUTH_ERROR_MESSAGES } from '@/server/auth/oauth-resolve';

export const metadata = privatePageMetadata('Log in');

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, '/');
  if (await getCurrentUser()) redirect(next);
  const oauthError = sp.error?.startsWith('oauth_') ? OAUTH_ERROR_MESSAGES[sp.error.slice(6)] : undefined;

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="h2">Log in</h1>
        <p className="small muted">Your hub account: stars, comments and the handlers you publish.</p>
      </div>
      {oauthError && (
        <p role="alert" className="form-error small">
          {oauthError}
        </p>
      )}
      <OAuthButtons next={next} />
      <ActionForm action={loginAction} submitLabel="Log in">
        <input type="hidden" name="next" value={next} />
        <TextField
          name="identifier"
          label="Email or username"
          autoComplete="username"
          required
          maxLength={254}
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
        />
        {smtpEnabled() && (
          <p className="small">
            <Link href="/forgot-password" className="underline">
              Forgot your password?
            </Link>
          </p>
        )}
      </ActionForm>
      <p className="small muted">
        New here?{' '}
        <Link
          href={next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`}
          className="underline"
        >
          Create an account
        </Link>
        .
      </p>
    </div>
  );
}
