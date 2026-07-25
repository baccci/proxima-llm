import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge tailwind classes, resolving conflicts so the last one wins.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
