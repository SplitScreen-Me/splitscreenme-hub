import Link from 'next/link';
import { ActionForm, TextField } from '@/components/interactive/ActionForm';
import { smtpEnabled } from '@/lib/env';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { forgotPasswordAction } from '@/server/actions/auth';

export const metadata = privatePageMetadata('Forgot password');

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="h2">Forgot your password?</h1>
        <p className="small muted">We send a single-use link to the address of your account.</p>
      </div>
      {smtpEnabled() ? (
        <ActionForm action={forgotPasswordAction} submitLabel="Send the link" resetOnSuccess>
          <TextField name="email" label="Email" type="email" autoComplete="email" required maxLength={254} />
        </ActionForm>
      ) : (
        <p className="small">
          Password reset by email is not available on this site yet. If your account is linked to Discord,
          GitHub or Google, log in with it; otherwise ask a moderator on Discord.
        </p>
      )}
      <p className="small muted">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
