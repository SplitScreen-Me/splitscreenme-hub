import { describe, expect, it } from 'vitest';
import { safeErrorMessage, sanitizeError } from './log';

class FakeQueryError extends Error {
  constructor(
    readonly query: string,
    readonly params: unknown[],
    cause: unknown,
  ) {
    super(`Failed query: ${query}\nparams: ${params.join(',')}`);
    this.cause = cause;
  }
}

describe('error scrubbing', () => {
  const err = new FakeQueryError(
    'insert into "users" ("id", "email", "password_hash") values ($1, $2, $3)',
    ['abc', 'someone@example.test', '$2b$11$hash'],
    { code: '23505', constraint_name: 'users_email_lower_uq', detail: 'Key (email)=(someone@example.test)' },
  );

  it('drops the query parameters from messages', () => {
    expect(safeErrorMessage(err.message)).toBe(
      'Failed query: insert into "users" ("id", "email", "password_hash") values ($1, $2, $3)',
    );
    expect(safeErrorMessage('x'.repeat(600))).toHaveLength(501);
  });

  it('keeps codes and names only, never params, details or values', () => {
    const safe = sanitizeError(err);
    const printed = `${safe.stack}\n${JSON.stringify(safe.cause)}\n${JSON.stringify(Object.entries(safe))}`;
    expect(printed).not.toContain('someone@example.test');
    expect(printed).not.toContain('$2b$');
    expect(safe.cause).toEqual({ code: '23505', constraint_name: 'users_email_lower_uq' });
    expect(safe.message).toContain('Failed query: insert into "users"');
  });
});
