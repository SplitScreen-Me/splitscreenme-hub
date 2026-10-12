'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { COMMENT_MAX } from '@/server/auth/rules';
import { deleteCommentAction, editCommentAction, postCommentAction } from '@/server/actions/community';
import { ActionForm, useActionForm } from './ActionForm';

/** Client parts of the comment components (the server wrappers decide who sees what). */

function BodyField({
  defaultValue,
  label,
  autoFocus,
}: {
  defaultValue?: string;
  label: string;
  autoFocus?: boolean;
}) {
  const { state } = useActionForm();
  const [length, setLength] = useState(defaultValue?.length ?? 0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (state.status === 'ok' && !defaultValue) setLength(0);
  }, [state, defaultValue]);
  const errors = state.fields?.body;
  return (
    <div className="grid gap-1">
      <label className="sr-only" htmlFor={undefined}>
        {label}
      </label>
      <textarea
        ref={ref}
        name="body"
        aria-label={label}
        className="control"
        rows={3}
        minLength={2}
        maxLength={COMMENT_MAX}
        required
        defaultValue={defaultValue}
        aria-invalid={errors ? true : undefined}
        onChange={(e) => setLength(e.currentTarget.value.length)}
        placeholder="Plain text. Links are allowed; be kind and specific."
      />
      <p className="micro faint text-right" aria-live="polite">
        {length} / {COMMENT_MAX}
      </p>
    </div>
  );
}

export function CommentComposer({
  handlerId,
  parentId,
  path,
  autoFocus,
  onPosted,
}: {
  /** Top-level comments; replies take their handler from the parent. */
  handlerId?: string;
  parentId?: string;
  path: string;
  autoFocus?: boolean;
  onPosted?: () => void;
}) {
  return (
    <ActionForm
      action={postCommentAction}
      onSuccess={onPosted}
      submitLabel={parentId ? 'Reply' : 'Post comment'}
      submitSize="sm"
      resetOnSuccess
      className="gap-2"
    >
      {handlerId && <input type="hidden" name="handlerId" value={handlerId} />}
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <input type="hidden" name="path" value={path} />
      <BodyField label={parentId ? 'Your reply' : 'Your comment'} autoFocus={autoFocus} />
    </ActionForm>
  );
}

/** Reply / Edit / Delete (own) / Hide (moderator) under one comment. */
export function CommentToolbar({
  commentId,
  path,
  canReply,
  ownBody,
  canHide,
}: {
  commentId: string;
  path: string;
  canReply: boolean;
  /** Set when the viewer wrote this comment: the edit form starts from it. */
  ownBody: string | null;
  canHide: boolean;
}) {
  const [mode, setMode] = useState<'none' | 'reply' | 'edit' | 'hide'>('none');
  const toggle = (m: typeof mode) => setMode((cur) => (cur === m ? 'none' : m));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {canReply && (
          <Button
            size="sm"
            variant="ghost"
            icon="comment"
            aria-expanded={mode === 'reply'}
            onClick={() => toggle('reply')}
          >
            Reply
          </Button>
        )}
        {ownBody !== null && (
          <>
            <Button size="sm" variant="ghost" aria-expanded={mode === 'edit'} onClick={() => toggle('edit')}>
              Edit
            </Button>
            <ActionForm
              action={deleteCommentAction.bind(null, commentId)}
              inline
              hideMessage
              confirm="Delete your comment? This cannot be undone."
            >
              <input type="hidden" name="path" value={path} />
              <DeleteButton />
            </ActionForm>
          </>
        )}
        {canHide && ownBody === null && (
          <Button size="sm" variant="ghost" aria-expanded={mode === 'hide'} onClick={() => toggle('hide')}>
            Hide
          </Button>
        )}
      </div>
      {mode === 'reply' && (
        <CommentComposer parentId={commentId} path={path} autoFocus onPosted={() => setMode('none')} />
      )}
      {mode === 'edit' && ownBody !== null && (
        <ActionForm
          action={editCommentAction.bind(null, commentId)}
          submitLabel="Save"
          submitSize="sm"
          className="gap-2"
          onSuccess={() => setMode('none')}
        >
          <input type="hidden" name="path" value={path} />
          <BodyField label="Edit your comment" defaultValue={ownBody} autoFocus />
        </ActionForm>
      )}
      {mode === 'hide' && (
        <ActionForm
          action={deleteCommentAction.bind(null, commentId)}
          submitLabel="Hide comment"
          submitVariant="danger"
          submitSize="sm"
          className="gap-2"
        >
          <input type="hidden" name="path" value={path} />
          <input
            name="reason"
            className="control"
            placeholder="Reason (kept in the audit log)"
            maxLength={500}
            aria-label="Reason"
          />
        </ActionForm>
      )}
    </div>
  );
}

function DeleteButton() {
  const { pending, state } = useActionForm();
  return (
    <>
      <Button size="sm" variant="ghost" type="submit" disabled={pending}>
        Delete
      </Button>
      {state.status === 'error' && <span className="form-error">{state.message}</span>}
    </>
  );
}
