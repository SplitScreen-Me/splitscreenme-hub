'use client';

import { useRef, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';

/**
 * Native <dialog> (focus trap, Escape and backdrop handled by the browser). The trigger opens it; content
 * can hold a server-rendered form. Buttons with `value="cancel"` inside a `method="dialog"` form close it.
 */
export function Dialog({
  triggerLabel,
  triggerVariant = 'default',
  title,
  children,
}: {
  triggerLabel: ReactNode;
  triggerVariant?: ButtonVariant;
  title: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button variant={triggerVariant} onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </Button>
      <dialog
        ref={ref}
        className="dialog"
        onClick={(e) => {
          if (e.target === ref.current) ref.current.close();
        }}
      >
        <div className="dialog-body">
          <h2 className="h3">{title}</h2>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** A "Cancel" button that closes the enclosing dialog. */
export function DialogClose({ children = 'Cancel' }: { children?: ReactNode }) {
  return (
    <form method="dialog" className="contents">
      <Button type="submit" variant="ghost" value="cancel">
        {children}
      </Button>
    </form>
  );
}
