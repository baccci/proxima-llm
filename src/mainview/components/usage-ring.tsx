interface UsageRingProps {
  fraction: number
  size?: number
}

export function UsageRing({ fraction, size = 20 }: UsageRingProps) {
  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = circumference * Math.min(1, Math.max(0, fraction))

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-surface-hover"
      />
      {/* Arc has no text-* class so it inherits the parent's currentColor
          (e.g. text-accent-500 in the composer), instead of forcing gray. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
      />
    </svg>
  )
}
