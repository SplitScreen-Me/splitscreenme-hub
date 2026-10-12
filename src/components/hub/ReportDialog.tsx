'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Form';

const REASONS = [
  ['broken', 'It does not work'],
  ['outdated', 'It broke after a game update'],
  ['wrong_game', 'It is for another game'],
  ['malware', 'Malware or suspicious files'],
  ['inappropriate', 'Inappropriate content'],
  ['spam', 'Spam'],
  ['copyright', 'Copyright issue'],
  ['other', 'Something else'],
] as const;

type State = { kind: 'idle' | 'sending' | 'sent' } | { kind: 'error'; message: string };

/**
 * "Report this handler": a native dialog whose form posts to POST /api/v3/handlers/{id}/reports, the same
 * endpoint the app uses (docs/ARCHITECTURE.md 5.6). Reports are anonymous and rate limited by the API.
 */
export function ReportDialog({ handlerId, version }: { handlerId: string; version: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const id = useId();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const message = String(data.get('message') ?? '').trim();
    setState({ kind: 'sending' });
    try {
      const res = await fetch(`/api/v3/handlers/${encodeURIComponent(handlerId)}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: data.get('reason'),
          ...(message && { message }),
          version,
          client: 'web',
        }),
      });
      if (res.ok) setState({ kind: 'sent' });
      else if (res.status === 429)
        setState({ kind: 'error', message: 'Too many reports from your network. Try again later.' });
      else setState({ kind: 'error', message: 'The report could not be sent. Try again later.' });
    } catch {
      setState({ kind: 'error', message: 'No connection. Try again later.' });
    }
  }

  const close = () => {
    ref.current?.close();
    if (state.kind !== 'sending') setState({ kind: 'idle' });
  };

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}>
        Report this handler
      </button>
      <dialog
        ref={ref}
        className="dialog"
        aria-labelledby={`${id}-title`}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="dialog-body">
          <h2 className="h3" id={`${id}-title`}>
            Report this handler
          </h2>
          {state.kind === 'sent' ? (
            <>
              <p className="small text-ink-2">Thanks. Hub moderators will look at it.</p>
              <div className="flex justify-end">
                <Button onClick={close}>Close</Button>
              </div>
            </>
          ) : (
            <form className="hub-report-form" onSubmit={onSubmit}>
              <p className="small text-ink-2">
                Reports go to the hub moderators. For help with a game, the comments are faster.
              </p>
              <div className="form-field">
                <label htmlFor={`${id}-reason`}>What is wrong?</label>
                <Select id={`${id}-reason`} name="reason" required defaultValue="broken">
                  {REASONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="form-field">
                <label htmlFor={`${id}-message`}>Details (optional)</label>
                <Textarea id={`${id}-message`} name="message" rows={4} maxLength={1000} />
              </div>
              {state.kind === 'error' && (
                <p className="form-error" role="alert">
                  {state.message}
                </p>
              )}
              <div className="row">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={state.kind === 'sending'}>
                  {state.kind === 'sending' ? 'Sending…' : 'Send report'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
