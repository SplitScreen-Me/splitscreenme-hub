import type { Result } from '@/server/auth/result';

/**
 * State of a form driven by a Server Action (`useActionState`): a message for the whole form, messages
 * per field, and a counter so that two identical answers in a row still re-render.
 */
export interface ActionState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  fields?: Record<string, string[]>;
  /** Free-form data for the form (e.g. the id of what was created). */
  data?: Record<string, string | number | boolean | null>;
  at?: number;
}

export const IDLE: ActionState = { status: 'idle' };

export function toState(result: Result<unknown>, okMessage?: string): ActionState {
  if (result.ok) return { status: 'ok', message: okMessage, at: Date.now() };
  return { status: 'error', message: result.error, fields: result.fields, at: Date.now() };
}

export const errorState = (message: string, fields?: Record<string, string[]>): ActionState => ({
  status: 'error',
  message,
  fields,
  at: Date.now(),
});

export const okState = (message?: string, data?: ActionState['data']): ActionState => ({
  status: 'ok',
  message,
  data,
  at: Date.now(),
});

/** FormData text value, trimmed of nothing (passwords keep their spaces); '' when absent or a file. */
export const text = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};
