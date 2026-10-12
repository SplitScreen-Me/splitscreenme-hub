import type { UserRole } from '@/db/schema';

/**
 * Who may do what: docs/ARCHITECTURE.md section 6.2. Pure function, no I/O; callers load the resource.
 * `canPost` (verified email or OAuth) is checked separately where the table says so.
 */
export type Action =
  | 'star'
  | 'comment.create'
  | 'comment.delete' // own comment, or moderator
  | 'handler.create'
  | 'handler.edit' // owner or moderator: metadata, public/private, soft-delete
  | 'version.upload' // owner or moderator
  | 'handler.read_private' // owner or moderator: private handlers, scripts, manifests
  | 'handler.approve'
  | 'version.verify'
  | 'comment.hide'
  | 'report.resolve'
  | 'game.edit'
  | 'user.verify_email'
  | 'user.trusted'
  | 'user.ban'
  | 'user.role'
  | 'handler.transfer'
  | 'handler.restore'
  | 'user.delete'
  | 'audit.read';

export interface Actor {
  id: string;
  role: UserRole;
}

/** Resource facts the rules need: who owns it. */
export interface Resource {
  ownerId?: string | null;
  authorId?: string | null;
}

const MODERATOR: ReadonlySet<Action> = new Set<Action>([
  'handler.approve',
  'version.verify',
  'comment.hide',
  'report.resolve',
  'game.edit',
  'user.verify_email',
  'user.trusted',
]);

const ADMIN: ReadonlySet<Action> = new Set<Action>([
  'user.ban',
  'user.role',
  'handler.transfer',
  'handler.restore',
  'user.delete',
  'audit.read',
]);

export function can(actor: Actor | null, action: Action, resource: Resource = {}): boolean {
  if (!actor) return false;
  const isMod = actor.role === 'moderator' || actor.role === 'admin';
  const isAdmin = actor.role === 'admin';

  if (ADMIN.has(action)) return isAdmin;
  if (MODERATOR.has(action)) return isMod;

  switch (action) {
    case 'star':
    case 'comment.create':
    case 'handler.create':
      return true;
    case 'comment.delete':
      return isMod || (!!resource.authorId && resource.authorId === actor.id);
    case 'handler.edit':
    case 'version.upload':
    case 'handler.read_private':
      return isMod || (!!resource.ownerId && resource.ownerId === actor.id);
    default:
      return false;
  }
}
