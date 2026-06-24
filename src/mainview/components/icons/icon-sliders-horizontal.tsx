import type React from 'react'

type IconSlidersHorizontalProps = React.ComponentProps<'svg'>

export const IconSlidersHorizontal: React.FC<IconSlidersHorizontalProps> = ({
  width = 24,
  ...props
}) => {
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
      <path d="M10 5H3" />
      <path d="M21 5h-7" />
      <path d="M14 3v4" />
      <path d="M8 12H3" />
      <path d="M21 12h-9" />
      <path d="M8 10v4" />
      <path d="M12 19H3" />
      <path d="M21 19h-5" />
      <path d="M16 17v4" />
    </svg>
  )
}
