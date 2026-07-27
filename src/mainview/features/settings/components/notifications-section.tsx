import { Switch } from '@/components/switch'
import { useHooks, useSetHook } from '@/features/settings/hooks/use-hooks'

export function NotificationsSection() {
  const { data: hooks = [] } = useHooks()
  const { mutate: setHook } = useSetHook()

  return (
    <div className="space-y-5">
      <p className="text-xs text-subtle">
        Optional cues for when a reply finishes while Proxima is in the background. Notifications
        respect your system Do Not Disturb.
      </p>

      {hooks.map((hook) => (
        <div key={hook.actionId} className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{hook.label}</p>
            <p className="text-xs text-subtle">{hook.description}</p>
          </div>
          <Switch
            checked={hook.enabled}
            onChange={() => setHook({ actionId: hook.actionId, enabled: !hook.enabled })}
          />
        </div>
      ))}
    </div>
  )
}
