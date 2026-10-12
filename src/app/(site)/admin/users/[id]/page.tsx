import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StateBadge } from '@/components/dashboard/StateBadge';
import { ActionForm, CheckField, SelectField, TextField } from '@/components/interactive/ActionForm';
import { Badge, DateTime, Dialog, PlainText, Section, Table } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { can } from '@/lib/auth/permissions';
import { isValidId } from '@/lib/ids';
import { privatePageMetadata } from '@/lib/seo/metadata';
import {
  banAction,
  changeRoleAction,
  deleteUserAction,
  trustedAuthorAction,
  verifyEmailAdminAction,
} from '@/server/actions/admin';
import { getUserForAdmin } from '@/server/private/admin';

export const metadata = privatePageMetadata('User · Backoffice');

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole('moderator');
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const data = await getUserForAdmin(id);
  if (!data) notFound();
  const { user: u, providers, handlers, recentComments, counts } = data;
  const self = u.id === me.id;
  const isAdmin = me.role === 'admin';

  return (
    <>
      <section className="pane pad grid gap-3">
        <p className="micro faint">
          <Link href="/admin/users" className="underline">
            Users
          </Link>
        </p>
        <h1 className="h1">{u.username}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={u.role === 'user' ? 'neutral' : 'verified'}>{u.role}</Badge>
          {u.trustedAuthor && (
            <Badge tone="ok" icon="check">
              Trusted author
            </Badge>
          )}
          {u.bannedAt && (
            <Badge tone="danger">
              Banned <DateTime value={u.bannedAt} />
            </Badge>
          )}
          {u.deletedAt && (
            <Badge>
              Deleted <DateTime value={u.deletedAt} />
            </Badge>
          )}
        </div>
        <dl className="grid gap-x-6 gap-y-1 small sm:grid-cols-[max-content_1fr]">
          <dt className="muted">Id</dt>
          <dd>
            <code>{u.id}</code>
          </dd>
          <dt className="muted">Email</dt>
          <dd>
            {u.email ? (isAdmin ? u.email : 'Hidden (admins only)') : 'None'} ·{' '}
            {u.emailVerifiedAt ? (
              <>
                confirmed <DateTime value={u.emailVerifiedAt} />
                {u.emailVerifiedByModerator && ' by a moderator'}
              </>
            ) : (
              'not confirmed'
            )}
          </dd>
          <dt className="muted">Sign-in</dt>
          <dd>
            {[u.passwordHash ? 'password' : null, ...providers.map((p) => p.provider)]
              .filter(Boolean)
              .join(', ') || 'none'}
          </dd>
          <dt className="muted">Joined</dt>
          <dd>
            <DateTime value={u.createdAt} /> · last login{' '}
            {u.lastLoginAt ? <DateTime value={u.lastLoginAt} format="relative" /> : 'never'}
          </dd>
          <dt className="muted">Activity</dt>
          <dd>
            {handlers.length} handler(s), {counts.comments} comment(s), {counts.reportsFiled} report(s) filed
          </dd>
          {u.banReason && (
            <>
              <dt className="muted">Ban reason</dt>
              <dd>{u.banReason}</dd>
            </>
          )}
        </dl>
      </section>

      {!u.deletedAt && (
        <Section title="Actions" id="actions">
          {self && <p className="small muted mb-4">This is you: role, ban and deletion are disabled.</p>}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid content-start gap-3">
              {u.email && !u.emailVerifiedAt && (
                <ActionForm
                  action={verifyEmailAdminAction.bind(null, u.id)}
                  submitLabel="Mark email as confirmed"
                  submitVariant="default"
                  submitSize="sm"
                  confirm="Only if you are sure this person owns the address. Continue?"
                />
              )}
              <ActionForm
                action={trustedAuthorAction.bind(null, u.id, !u.trustedAuthor)}
                submitLabel={u.trustedAuthor ? 'Remove trusted author' : 'Make trusted author'}
                submitVariant="default"
                submitSize="sm"
              >
                <p className="small muted">Trusted authors&rsquo; new handlers are approved on creation.</p>
              </ActionForm>
            </div>
            {isAdmin && !self && (
              <div className="grid content-start gap-5">
                <ActionForm
                  action={changeRoleAction.bind(null, u.id)}
                  submitLabel="Change role"
                  submitVariant="default"
                  submitSize="sm"
                  confirm="Change this user's role? Their sessions are closed."
                >
                  <SelectField
                    name="role"
                    label="Role"
                    defaultValue={u.role}
                    options={[
                      { value: 'user', label: 'User' },
                      { value: 'moderator', label: 'Moderator' },
                      { value: 'admin', label: 'Admin' },
                    ]}
                  />
                </ActionForm>
                {u.bannedAt ? (
                  <ActionForm
                    action={banAction.bind(null, u.id, false)}
                    submitLabel="Unban"
                    submitVariant="default"
                    submitSize="sm"
                  />
                ) : (
                  <ActionForm
                    action={banAction.bind(null, u.id, true)}
                    submitLabel="Ban"
                    submitVariant="danger"
                    submitSize="sm"
                    confirm="Ban this user? Their sessions are closed."
                  >
                    <TextField name="reason" label="Reason" maxLength={500} required />
                    <CheckField name="unpublishHandlers" label="Also make all their handlers private" />
                  </ActionForm>
                )}
                {can(me, 'user.delete') && (
                  <div>
                    <Dialog
                      triggerLabel="Delete account"
                      triggerVariant="danger"
                      title={`Delete ${u.username}?`}
                    >
                      <ActionForm
                        action={deleteUserAction.bind(null, u.id)}
                        submitLabel="Delete account"
                        submitVariant="danger"
                      >
                        <p className="small muted">
                          Anonymises the account: profile, email, password, sessions, linked accounts and
                          stars are erased, comments removed. Handlers stay as &ldquo;Deleted user&rdquo;.
                        </p>
                        <TextField
                          name="confirm"
                          label='Type "delete" to confirm'
                          required
                          autoComplete="off"
                        />
                      </ActionForm>
                    </Dialog>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Handlers" id="handlers">
        {handlers.length === 0 ? (
          <p className="small muted">None.</p>
        ) : (
          <Table>
            <tbody>
              {handlers.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link href={`/admin/handlers/${h.id}`} className="underline">
                      {h.title}
                    </Link>{' '}
                    <span className="micro faint">{h.gameName}</span>
                  </td>
                  <td>
                    <StateBadge state={h.state} />
                  </td>
                  <td className="num">{h.downloadCount.toLocaleString('en')}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Recent comments" id="comments">
        {recentComments.length === 0 ? (
          <p className="small muted">None.</p>
        ) : (
          <ul className="grid gap-2">
            {recentComments.map((c) => (
              <li key={c.id} className={`rounded-ctl bg-pane-2 p-3 ${c.deletedAt ? 'opacity-60' : ''}`}>
                <p className="micro faint">
                  {c.handlerTitle} · <DateTime value={c.createdAt} format="relative" />{' '}
                  {c.deletedAt && '· deleted'}
                </p>
                {c.body ? (
                  <PlainText text={c.body} className="small" />
                ) : (
                  <p className="small faint">(erased)</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="small mt-3">
          <Link href={`/admin/comments?status=all&q=${encodeURIComponent(u.username)}`} className="underline">
            Moderate this user&rsquo;s comments
          </Link>
        </p>
      </Section>
    </>
  );
}
