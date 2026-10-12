'use client';

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { IDLE, type ActionState } from '@/server/actions/types';

/**
 * A form posting to a Server Action, with the action's messages shown in place. Works without
 * JavaScript (progressive enhancement through `action`); with JavaScript it submits in a transition so
 * React does not reset the fields after an error. Field components read the per-field messages from
 * context, so server pages can compose forms from these client parts.
 */

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

interface Ctx {
  state: ActionState;
  pending: boolean;
}

const FormCtx = createContext<Ctx>({ state: IDLE, pending: false });

export const useActionForm = () => useContext(FormCtx);

export function ActionForm({
  action,
  children,
  className,
  submitLabel,
  submitVariant = 'primary',
  submitIcon,
  submitSize,
  confirm,
  resetOnSuccess,
  inline,
  hideMessage,
  onSuccess,
}: {
  action: FormAction;
  children?: ReactNode;
  className?: string;
  /** Renders a submit button after the children. */
  submitLabel?: ReactNode;
  submitVariant?: ButtonVariant;
  submitIcon?: IconName;
  submitSize?: 'sm' | 'md';
  /** Asks the browser to confirm first. */
  confirm?: string;
  resetOnSuccess?: boolean;
  /** One row (buttons in tables). */
  inline?: boolean;
  hideMessage?: boolean;
  /** Client parents only: called after each successful submission. */
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== 'ok') return;
    if (resetOnSuccess) ref.current?.reset();
    onSuccess?.();
    // Once per answer: `state` changes identity on every submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    if (confirm && !window.confirm(confirm)) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };

  return (
    <FormCtx.Provider value={{ state, pending }}>
      <form
        ref={ref}
        action={formAction}
        onSubmit={onSubmit}
        className={cn(inline ? 'inline-flex flex-wrap items-center gap-2' : 'grid gap-4', className)}
        aria-busy={pending || undefined}
        noValidate={false}
      >
        {children}
        {submitLabel && (
          <div className={cn(!inline && 'flex flex-wrap items-center gap-3')}>
            <SubmitButton variant={submitVariant} icon={submitIcon} size={submitSize}>
              {submitLabel}
            </SubmitButton>
          </div>
        )}
        {!hideMessage && <FormMessage />}
      </form>
    </FormCtx.Provider>
  );
}

export function SubmitButton({
  children,
  variant = 'primary',
  icon,
  size,
  name,
  value,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: 'sm' | 'md';
  name?: string;
  value?: string;
}) {
  const { pending } = useActionForm();
  return (
    <Button
      type="submit"
      variant={variant}
      icon={icon}
      size={size}
      disabled={pending}
      name={name}
      value={value}
    >
      {children}
    </Button>
  );
}

/** The action's overall message: polite status on success, alert on error. */
export function FormMessage({ className }: { className?: string }) {
  const { state } = useActionForm();
  if (state.status === 'idle' || !state.message) return null;
  return state.status === 'ok' ? (
    <p role="status" className={cn('small text-ok', className)} key={state.at}>
      {state.message}
    </p>
  ) : (
    <p role="alert" className={cn('form-error small', className)} key={state.at}>
      {state.message}
    </p>
  );
}

type Common = {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
};

function Wrap({
  name,
  label,
  hint,
  className,
  children,
}: Common & {
  children: (p: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const { state } = useActionForm();
  const errors = state.fields?.[name];
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('form-field', className)}>
      <label htmlFor={id}>{label}</label>
      {children({ id, ...(errorId && { 'aria-invalid': true as const }), 'aria-describedby': describedBy })}
      {hint && (
        <p className="form-hint" id={hintId}>
          {hint}
        </p>
      )}
      {errorId && (
        <p className="form-error" id={errorId}>
          {errors!.join(' ')}
        </p>
      )}
    </div>
  );
}

export function TextField({
  type = 'text',
  defaultValue,
  placeholder,
  autoComplete,
  required,
  minLength,
  maxLength,
  min,
  max,
  pattern,
  rows,
  readOnly,
  inputMode,
  ...common
}: Common & {
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'url' | 'date';
  defaultValue?: string | number;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  /** Multi-line when set. */
  rows?: number;
  readOnly?: boolean;
  inputMode?: 'numeric' | 'email' | 'text';
}) {
  return (
    <Wrap {...common}>
      {(a) =>
        rows ? (
          <textarea
            {...a}
            name={common.name}
            className="control"
            rows={rows}
            defaultValue={defaultValue}
            placeholder={placeholder}
            required={required}
            minLength={minLength}
            maxLength={maxLength}
            readOnly={readOnly}
          />
        ) : (
          <input
            {...a}
            name={common.name}
            type={type}
            className="control"
            defaultValue={defaultValue}
            placeholder={placeholder}
            autoComplete={autoComplete}
            required={required}
            minLength={minLength}
            maxLength={maxLength}
            min={min}
            max={max}
            pattern={pattern}
            readOnly={readOnly}
            inputMode={inputMode}
          />
        )
      }
    </Wrap>
  );
}

export function SelectField({
  options,
  defaultValue,
  ...common
}: Common & { options: { value: string; label: string }[]; defaultValue?: string }) {
  return (
    <Wrap {...common}>
      {(a) => (
        <select {...a} name={common.name} className="control" defaultValue={defaultValue}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Wrap>
  );
}

/** A checkbox with its error line (terms, toggles). */
export function CheckField({
  name,
  label,
  defaultChecked,
  required,
}: {
  name: string;
  label: ReactNode;
  defaultChecked?: boolean;
  required?: boolean;
}) {
  const { state } = useActionForm();
  const errors = state.fields?.[name];
  return (
    <div className="grid gap-1">
      <label className="check">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          required={required}
          aria-invalid={errors ? true : undefined}
        />
        <span>{label}</span>
      </label>
      {errors && <p className="form-error">{errors.join(' ')}</p>}
    </div>
  );
}

/** The messages of one field, for controls that are not TextField/SelectField (radio groups...). */
export function FieldErrors({ name }: { name: string }) {
  const { state } = useActionForm();
  const errors = state.fields?.[name];
  return errors ? <p className="form-error">{errors.join(' ')}</p> : null;
}
