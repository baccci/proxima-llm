import {
  CONTROL_SERVER_PORT_MAX,
  CONTROL_SERVER_PORT_MIN,
  DEFAULT_SETTINGS,
} from '@shared/schemas/settings.schema'
import { useMutation } from '@tanstack/react-query'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { Switch } from '@/components/switch'
import { useMountEffect } from '@/hooks/use-mount-effect'
import { useControlTokens } from '../hooks/use-control-tokens'
import { useSettings } from '../hooks/use-settings'
import { settings } from '../settings.api'

const MS_PER_SECOND = 1000

type PairingCode = { code: string; expiresAt: string }

function remainingSeconds(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / MS_PER_SECOND))
}

export function ControlServerSection() {
  const { data: currentSettings } = useSettings()
  const enabled = currentSettings?.controlServerEnabled ?? false
  const port = currentSettings?.controlServerPort ?? DEFAULT_SETTINGS.controlServerPort
  const focusFollowsIncoming = currentSettings?.focusFollowsIncoming ?? true

  const { data: tokens = [] } = useControlTokens(enabled)

  const [pairingCode, setPairingCode] = React.useState<PairingCode | null>(null)

  const generateMutation = useMutation({
    mutationFn: () => settings.generatePairingCode(),
    onSuccess: (result) => {
      if (result) {
        setPairingCode(result)
      }
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (token: string) => settings.revokeControlToken(token),
  })

  return (
    <div className="space-y-6">
      {/* Enable / status */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Local control server</p>
            <p className="text-xs text-subtle mt-0.5">
              Lets local scripts inject prompts that run inside the app.
            </p>
          </div>
          <Switch
            checked={enabled}
            onChange={() => settings.update({ controlServerEnabled: !enabled })}
            aria-label="Local control server"
          />
        </div>

        <p className={cn('mt-2 text-xs font-mono', enabled ? 'text-foreground' : 'text-subtle')}>
          {enabled ? `Listening on 127.0.0.1:${port}` : 'Off'}
        </p>
      </div>

      {/* Follow incoming prompts */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Follow incoming prompts</p>
          <p className="text-xs text-subtle mt-0.5">
            When watching in focus mode, jump to prompts sent from connected apps. Off: show a 'Jump
            in' prompt instead.
          </p>
        </div>
        <Switch
          checked={focusFollowsIncoming}
          onChange={() => settings.update({ focusFollowsIncoming: !focusFollowsIncoming })}
          aria-label="Follow incoming prompts"
        />
      </div>

      {/* Port */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="cs-port">
          Port
        </label>
        <div className="flex gap-2">
          <PortField
            key={port}
            port={port}
            disabled={enabled}
            onCommit={(controlServerPort) => settings.update({ controlServerPort })}
          />
          {enabled && (
            <p className="self-center text-xs text-subtle">
              Disable the server to change the port.
            </p>
          )}
        </div>
      </div>

      {/* Pairing code */}
      <div>
        <p className="text-sm font-medium text-foreground mb-1">Pairing code</p>
        <p className="text-xs text-subtle mb-3">
          Share this one-time code with an external script. It expires in 5 minutes.
        </p>
        {pairingCode && (
          <PairingCodeCard pairingCode={pairingCode} onExpire={() => setPairingCode(null)} />
        )}
        {!pairingCode && (
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={!enabled || generateMutation.isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            Generate pairing code
          </button>
        )}
      </div>

      {/* Active tokens */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Connected clients</p>
        {tokens.length > 0 && (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div
                key={t.token}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5"
              >
                <div>
                  <p className="text-sm text-foreground">{t.label}</p>
                  <p className="text-xs text-subtle mt-0.5">
                    Created {new Date(t.createdAt).toLocaleDateString()}
                    {t.lastUsedAt
                      ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revokeMutation.mutate(t.token)}
                  className="text-xs text-danger hover:text-danger/80 transition-colors cursor-pointer"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
        {tokens.length === 0 && <p className="text-xs text-subtle">No connected clients.</p>}
      </div>
    </div>
  )
}

type PairingCodeCardProps = {
  pairingCode: PairingCode
  onExpire: () => void
}

// Mounted only while a code exists, so the once-a-second ticker is a plain mount effect. When
// the code runs out, onExpire clears it, which unmounts this card and clears the interval.
function PairingCodeCard({ pairingCode, onExpire }: PairingCodeCardProps) {
  const [countdown, setCountdown] = React.useState(() => remainingSeconds(pairingCode.expiresAt))

  useMountEffect(() => {
    const tick = () => {
      const remaining = remainingSeconds(pairingCode.expiresAt)
      setCountdown(remaining)
      if (remaining === 0) {
        onExpire()
      }
    }

    tick()
    const id = setInterval(tick, MS_PER_SECOND)
    return () => clearInterval(id)
  })

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-1">
      <p className="font-mono text-lg tracking-widest text-foreground select-all">
        {pairingCode.code}
      </p>
      <p className="text-xs text-subtle">Expires in {countdown}s · single use</p>
    </div>
  )
}

type PortFieldProps = {
  port: number
  disabled: boolean
  onCommit: (port: number) => void
}

// Seeds its draft from the loaded port. The parent keys it on that port, so the draft
// re-seeds once real settings arrive instead of sticking on the pre-load default.
function PortField({ port, disabled, onCommit }: PortFieldProps) {
  const [value, setValue] = React.useState(String(port))

  function commit() {
    const n = Number.parseInt(value, 10)
    if (Number.isNaN(n) || n < CONTROL_SERVER_PORT_MIN || n > CONTROL_SERVER_PORT_MAX) {
      return
    }
    onCommit(n)
  }

  return (
    <input
      id="cs-port"
      type="number"
      min={CONTROL_SERVER_PORT_MIN}
      max={CONTROL_SERVER_PORT_MAX}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      disabled={disabled}
      className="w-28 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-border-strong disabled:opacity-50"
    />
  )
}
