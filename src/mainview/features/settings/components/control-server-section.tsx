import { useQuery } from '@tanstack/react-query'
import React from 'react'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'
import { useSettings } from '../hooks/use-settings'
import { settings } from '../settings.api'

export function ControlServerSection() {
  const { data: currentSettings } = useSettings()
  const enabled = currentSettings?.controlServerEnabled ?? false
  const port = currentSettings?.controlServerPort ?? 7865
  const focusFollowsIncoming = currentSettings?.focusFollowsIncoming ?? true

  const { data: tokens = [], refetch: refetchTokens } = useQuery({
    queryKey: queryKeys.controlTokens(),
    queryFn: () => electroview.rpc?.request.listControlTokens({}),
    enabled,
  })

  const [pairingCode, setPairingCode] = React.useState<{ code: string; expiresAt: string } | null>(
    null,
  )
  const [countdown, setCountdown] = React.useState(0)
  const [portInput, setPortInput] = React.useState(String(port))

  // Tick down remaining seconds for the pairing code
  React.useEffect(() => {
    if (!pairingCode) return
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(pairingCode.expiresAt).getTime() - Date.now()) / 1000),
      )
      setCountdown(remaining)
      if (remaining === 0) setPairingCode(null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [pairingCode])

  async function handleToggle() {
    await settings.update({ controlServerEnabled: !enabled })
    if (!enabled) refetchTokens()
  }

  async function handlePortChange() {
    const n = Number.parseInt(portInput, 10)
    if (Number.isNaN(n) || n < 1024 || n > 65535) return
    await settings.update({ controlServerPort: n })
  }

  async function handleGenerateCode() {
    const result = await settings.generatePairingCode()
    if (result) setPairingCode(result)
  }

  async function handleRevoke(token: string) {
    await settings.revokeControlToken(token)
    refetchTokens()
  }

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
          <button
            type="button"
            onClick={handleToggle}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              enabled ? 'bg-brand' : 'bg-border'
            }`}
            role="switch"
            aria-checked={enabled}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <p className={`mt-2 text-xs font-mono ${enabled ? 'text-brand' : 'text-subtle'}`}>
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
        <button
          type="button"
          role="switch"
          aria-checked={focusFollowsIncoming}
          onClick={() => settings.update({ focusFollowsIncoming: !focusFollowsIncoming })}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            focusFollowsIncoming ? 'bg-brand' : 'bg-border'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              focusFollowsIncoming ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Port */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="cs-port">
          Port
        </label>
        <div className="flex gap-2">
          <input
            id="cs-port"
            type="number"
            min={1024}
            max={65535}
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            onBlur={handlePortChange}
            disabled={enabled}
            className="w-28 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-border-strong disabled:opacity-50"
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
        {pairingCode ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-1">
            <p className="font-mono text-lg tracking-widest text-foreground select-all">
              {pairingCode.code}
            </p>
            <p className="text-xs text-subtle">Expires in {countdown}s · single use</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateCode}
            disabled={!enabled}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            Generate pairing code
          </button>
        )}
      </div>

      {/* Active tokens */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Connected clients</p>
        {tokens && tokens.length > 0 ? (
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
                  onClick={() => handleRevoke(t.token)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-subtle">No connected clients.</p>
        )}
      </div>
    </div>
  )
}
