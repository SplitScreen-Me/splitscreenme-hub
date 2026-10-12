'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { resetPasswordAction, verifyEmailAction } from '@/server/actions/auth';
import { IDLE } from '@/server/actions/types';
import { ActionForm, TextField } from '@/components/interactive/ActionForm';

/**
 * Email links carry their token in the URL fragment, which never reaches a server or a Referer. These
 * forms read it in the browser, then drop it from the address bar and the history.
 */
function useFragmentToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const m = /(?:^|[#&])token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    setToken(m?.[1] ?? null);
    if (m) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  return token;
}

function MissingToken({ what }: { what: string }) {
  return (
    <p role="alert" className="form-error small">
      This page needs the link from your email. Open the {what} link again, in full.
    </p>
  );
}

export function ResetPasswordForm() {
  const token = useFragmentToken();
  if (token === undefined) return <p className="small muted">Loading…</p>;
  if (token === null) return <MissingToken what="reset" />;
  return (
    <ActionForm action={resetPasswordAction} submitLabel="Set new password">
      <input type="hidden" name="token" value={token} />
      <TextField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters."
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
  );
}

/** Confirms automatically once the token is read (a POST through the Server Action). */
export function VerifyEmailForm() {
  const token = useFragmentToken();
  const [state, action, pending] = useActionState(verifyEmailAction, IDLE);
  const sent = useRef(false);
  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    const fd = new FormData();
    fd.set('token', token);
    startTransition(() => action(fd));
  }, [token, action]);

  if (token === null) return <MissingToken what="confirmation" />;
  if (token === undefined || pending || state.status === 'idle') {
    return (
      <p role="status" className="small muted">
        Confirming your address…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="grid gap-3">
        <p role="alert" className="form-error small">
          {state.message}
        </p>
        <p className="small muted">
          You can ask for a new link on your{' '}
          <Link href="/account" className="underline">
            account page
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <p role="status" className="small text-ok">
        {state.message}
      </p>
      <p className="small">
        {state.data?.signedIn ? (
          <Link href="/account" className="underline">
            Back to your account
          </Link>
        ) : (
          <Link href="/login" className="underline">
            Log in
          </Link>
        )}
      </p>
    </div>
  );
}
