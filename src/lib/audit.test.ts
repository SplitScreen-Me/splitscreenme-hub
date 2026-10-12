import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db';
import { auditLog } from '@/db/schema';
import { dbAvailable, truncateAll } from '@/test/db';
import { audit, sanitizeDetails } from './audit';

describe('audit details', () => {
  it('drops keys that could carry secrets or personal data', () => {
    expect(
      sanitizeDetails({
        reason: 'spam',
        email: 'x@y',
        passwordHash: 'h',
        token: 't',
        ip: '1.2.3.4',
        count: 2,
      }),
    ).toEqual({ reason: 'spam', count: 2 });
  });
});

describe.runIf(dbAvailable())('audit_log is append-only', () => {
  beforeAll(() => truncateAll());

  it('accepts inserts, refuses updates and deletes', async () => {
    const db = getDb();
    await audit(db, {
      actor: { id: 'adminFixture00001', role: 'admin' },
      action: 'user.ban',
      target: { type: 'user', id: 'someone0000000001' },
      details: { reason: 'spam' },
      ip: '203.0.113.7',
    });
    const [row] = await db.select().from(auditLog);
    expect(row?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.details).toEqual({ reason: 'spam' });
    await expect(db.execute(sql`update audit_log set action = 'x'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from audit_log`)).rejects.toThrow();
  });

  it('lets the retention job delete inside a purge transaction', async () => {
    const db = getDb();
    const deleted = await db.transaction(async (tx) => {
      await tx.execute(sql`set local ssm.audit_purge = 'on'`);
      return (await tx.execute(sql`delete from audit_log`)).count;
    });
    expect(deleted).toBe(1);
  });
});
