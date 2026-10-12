import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { ActionForm, CheckField, TextField } from '@/components/interactive/ActionForm';
import { getCurrentUser } from '@/lib/auth/current-user';
import { smtpEnabled } from '@/lib/env';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths, safeNextPath } from '@/lib/urls';
import { registerAction } from '@/server/actions/auth';
import { USERNAME_MAX, USERNAME_MIN } from '@/server/auth/rules';

export const metadata = privatePageMetadata('Create an account');

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next, '/');
  if (await getCurrentUser()) redirect(next);
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="h2">Create an account</h1>
        <p className="small muted">
          To star handlers, comment and publish your own. Playing needs no account.
        </p>
      </div>
      <OAuthButtons next={next} />
      <ActionForm action={registerAction} submitLabel="Create account">
        <TextField
          name="username"
          label="Username"
          autoComplete="username"
          required
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          pattern="[A-Za-z0-9_\-]+"
          hint={`Public. ${USERNAME_MIN} to ${USERNAME_MAX} letters, digits, "-" or "_".`}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          hint={
            smtpEnabled()
              ? 'Private. We send a link to confirm it before you can post.'
              : 'Private. Used to recover your account.'
          }
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters. A passphrase is easier to remember."
        />
        <CheckField
          name="acceptTerms"
          required
          label={
            <>
              I accept the{' '}
              <Link href={paths.legal('terms')} className="underline" target="_blank">
                terms and content rules
              </Link>{' '}
              and have read the{' '}
              <Link href={paths.legal('privacy')} className="underline" target="_blank">
                privacy policy
              </Link>
              .
            </>
          }
        />
      </ActionForm>
      <p className="small muted">
        Already registered?{' '}
        <Link href={paths.login(next === '/' ? undefined : next)} className="underline">
          Log in
        </Link>
        .
      </p>
    </div>
  );
}
