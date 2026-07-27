export const TABS = {
  APPEARANCE: 'appearance',
  PROVIDERS: 'providers',
  ADVANCED: 'advanced',
  TOOLS: 'tools',
  CONNECT: 'connect',
  MEMORY: 'memory',
  NOTIFICATIONS: 'notifications',
} as const

export type Tab = (typeof TABS)[keyof typeof TABS]
