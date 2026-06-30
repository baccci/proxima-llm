import type React from 'react'

type IconAnthropicProps = React.ComponentProps<'svg'>

export const IconAnthropic: React.FC<IconAnthropicProps> = ({ width = 35 }) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} fill="none" viewBox="0 0 35 24">
      <path
        fill="currentColor"
        d="M24.548 0h-5.21l9.5 24h5.209zM9.499 0 0 24h5.311l1.943-5.04h9.937L19.134 24h5.311L14.946 0zm-.527 14.503 3.25-8.434 3.252 8.434z"
      />
    </svg>
  )
}
