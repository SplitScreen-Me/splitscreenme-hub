import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface Look {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconAfter?: IconName;
}

export function buttonClass({ variant = 'default', size = 'md' }: Look = {}, className?: string) {
  return cn(
    'btn',
    variant === 'primary' && 'btn-primary',
    variant === 'ghost' && 'btn-ghost',
    variant === 'danger' && 'btn-danger',
    size === 'sm' && 'btn-sm',
    size === 'lg' && 'btn-lg',
    size === 'icon' && 'btn-icon',
    className,
  );
}

function Content({ icon, iconAfter, children }: Look & { children?: ReactNode }) {
  return (
    <>
      {icon && <Icon name={icon} />}
      {children}
      {iconAfter && <Icon name={iconAfter} />}
    </>
  );
}

/** `<button>`; defaults to type="button" so it never submits a form by accident. */
export function Button({
  variant,
  size,
  icon,
  iconAfter,
  className,
  type = 'button',
  children,
  ...rest
}: Look & ComponentProps<'button'>) {
  return (
    <button type={type} className={buttonClass({ variant, size }, className)} {...rest}>
      <Content icon={icon} iconAfter={iconAfter}>
        {children}
      </Content>
    </button>
  );
}

/**
 * A link that looks like a button: next/link for internal pages; a plain <a> for external URLs and for files
 * (`download` set), which next/link would prefetch and try to route.
 */
export function LinkButton({
  variant,
  size,
  icon,
  iconAfter,
  className,
  href,
  children,
  ...rest
}: Look & Omit<ComponentProps<'a'>, 'href'> & { href: string }) {
  const cls = buttonClass({ variant, size }, className);
  const content = (
    <Content icon={icon} iconAfter={iconAfter}>
      {children}
    </Content>
  );
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={cls} rel="noopener noreferrer" {...rest}>
        {content}
      </a>
    );
  }
  if (rest.download !== undefined) {
    return (
      <a href={href} className={cls} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {content}
    </Link>
  );
}
