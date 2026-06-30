import type React from 'react'

type IconTerminalProps = React.ComponentProps<'svg'>

export const IconTerminal: React.FC<IconTerminalProps> = ({ width = 24, ...props }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="17" x2="20" y2="17" />
    </svg>
  )
}
