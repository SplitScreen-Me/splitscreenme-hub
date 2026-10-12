import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

/** Search-style field: icon, bare input, optional trailing key hint (mockup `.field`). */
export function Field({
  icon,
  trailing,
  className,
  ...input
}: { icon?: IconName; trailing?: ReactNode } & ComponentProps<'input'>) {
  return (
    <label className={cn('field', className)}>
      {icon && <Icon name={icon} />}
      <input {...input} />
      {trailing}
    </label>
  );
}

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn('control', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn('control', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cn('control', className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: { label: ReactNode } & Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <label className={cn('check', className)}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/** On/off toggle; a checkbox underneath, so it posts like one. */
export function Switch({
  label,
  className,
  ...rest
}: { label: ReactNode } & Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <label className={cn('switch', className)}>
      <input type="checkbox" role="switch" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/**
 * Label + control + hint + errors, wired with ids and aria attributes. `errors` takes the messages of a
 * zod field (`z.flattenError(err).fieldErrors.name`). The child is a render function receiving the props
 * to spread on the control.
 */
export function FormField({
  label,
  hint,
  errors,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  errors?: string[] | undefined;
  className?: string;
  children: (control: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
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
        <p className="form-error" id={errorId} role="alert">
          {errors!.join(' ')}
        </p>
      )}
    </div>
  );
}
