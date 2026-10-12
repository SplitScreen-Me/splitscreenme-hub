import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class names with Tailwind conflict resolution: `cn('px-2', cond && 'px-4')`. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
