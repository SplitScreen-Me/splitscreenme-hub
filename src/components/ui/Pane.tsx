import type { ComponentProps, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A lit pane on the black bezel: the core surface. `tone="2"` for a slightly lighter pane. */
export function Pane<T extends ElementType = 'div'>({
  as,
  tone,
  padded,
  className,
  children,
  ...rest
}: {
  as?: T;
  tone?: '1' | '2';
  padded?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentProps<T>, 'as' | 'className' | 'children'>) {
  const Tag: ElementType = as ?? 'div';
  return (
    <Tag className={cn('pane', tone === '2' && 'pane-2', padded && 'pad', className)} {...rest}>
      {children}
    </Tag>
  );
}

/** A split container: children are panes, the black gutter shows between them. */
export function Split({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cn('split', className)} {...rest}>
      {children}
    </div>
  );
}

/** A padded pane with a heading row (title left, optional action right). */
export function Section({
  title,
  eyebrow,
  action,
  id,
  className,
  headingLevel = 2,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
  headingLevel?: 1 | 2 | 3;
  children?: ReactNode;
}) {
  const H = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <section className={cn('pane pad', className)} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="pane-head">
        <div>
          {eyebrow && <p className="micro faint mb-2 font-semibold tracking-wide uppercase">{eyebrow}</p>}
          <H className={headingLevel === 1 ? 'h1' : 'h2'} id={id ? `${id}-title` : undefined}>
            {title}
          </H>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
