import { auditLog } from '@/db/schema';
import type { Queryable } from '@/db';
import { ipHash } from './request';

/**
 * Audit log (append-only, enforced by a trigger). Call inside the same transaction as the change.
 * No passwords, tokens, emails or raw IPs in `details`. docs/ARCHITECTURE.md section 6.6.
 */
export const AUDIT_ACTIONS = [
  'auth.password_changed',
  'auth.password_reset',
  'auth.email_changed',
  'auth.oauth_linked',
  'auth.oauth_unlinked',
  'auth.email_takeover',
  'auth.email_released',
  'auth.account_deleted',
  'handler.create',
  'handler.update',
  'handler.publish',
  'handler.unpublish',
  'handler.delete',
  'handler.restore',
  'handler.approve',
  'handler.revoke',
  'handler.transfer',
  'version.upload',
  'version.verify',
  'version.unverify',
  'version.delete',
  'comment.delete',
  'comment.restore',
  'report.create',
  'report.resolve',
  'report.dismiss',
  'user.role_change',
  'user.ban',
  'user.unban',
  'user.verify_email',
  'user.trusted',
  'user.delete',
  'game.update',
  'game.refresh',
  'system.import',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditTargetType = 'user' | 'handler' | 'version' | 'comment' | 'report' | 'game' | 'system';

export interface AuditEntry {
  /** null for anonymous or system actions */
  actor: { id: string; role: string } | null;
  action: AuditAction;
  target?: { type: AuditTargetType; id: string | number };
  details?: Record<string, unknown>;
  /** raw client IP: hashed with the day before storage, never stored as is */
  ip?: string;
}

/** Keys that must never reach the log, whatever the caller passes. */
const FORBIDDEN_DETAIL_KEYS = /pass(word)?|token|secret|cookie|email|^ip$|hash/i;

export function sanitizeDetails(details: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) if (!FORBIDDEN_DETAIL_KEYS.test(k)) out[k] = v;
  return out;
}

export async function audit(q: Queryable, entry: AuditEntry): Promise<void> {
  await q.insert(auditLog).values({
    actorId: entry.actor?.id ?? null,
    actorRole: entry.actor?.role ?? null,
    action: entry.action,
    targetType: entry.target?.type ?? null,
    targetId: entry.target ? String(entry.target.id) : null,
    ipHash: entry.ip ? ipHash(entry.ip) : null,
    details: sanitizeDetails(entry.details),
  });
}
