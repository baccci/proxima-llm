import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'
import { IconSpinner } from './icons/icon-spinner'

type SpinnerProps = React.ComponentProps<'svg'>

export const Spinner: React.FC<SpinnerProps> = ({ className, ...props }) => {
  return (
    <IconSpinner
      className={cn('animate-spin [animation-duration:0.75s] text-selected-border', className)}
      {...props}
    />
  )
}
