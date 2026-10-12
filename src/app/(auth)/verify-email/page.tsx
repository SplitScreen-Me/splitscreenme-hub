import type { Metadata } from 'next';
import { VerifyEmailForm } from '@/components/auth/TokenForms';
import { privatePageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = { ...privatePageMetadata('Confirm your email'), referrer: 'no-referrer' };

export default function VerifyEmailPage() {
  return (
    <div className="grid gap-5">
      <h1 className="h2">Confirm your email</h1>
      <VerifyEmailForm />
    </div>
  );
}
