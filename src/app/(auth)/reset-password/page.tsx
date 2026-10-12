import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/TokenForms';
import { privatePageMetadata } from '@/lib/seo/metadata';

// The token travels in the fragment; no-referrer keeps even the path out of third-party requests.
export const metadata: Metadata = { ...privatePageMetadata('Reset password'), referrer: 'no-referrer' };

export default function ResetPasswordPage() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="h2">Choose a new password</h1>
        <p className="small muted">Every session of your account is closed, then you are logged in here.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
