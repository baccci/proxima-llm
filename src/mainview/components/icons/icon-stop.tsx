import type React from 'react'

type IconStopProps = React.ComponentProps<'svg'>

export const IconStop: React.FC<IconStopProps> = ({ width = 24, ...props }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  )
}
