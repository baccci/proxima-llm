import React from 'react'
import { getContextUsage } from '@/features/chat/entities/context-usage'
import { useChat } from '@/features/chat/hooks/use-chats'
import { useMessages } from '@/features/chat/hooks/use-messages'
import { useModels } from '@/hooks/use-models'
import { useNavigationStore } from '@/store/navigation.store'
import { errorMessage } from '@/utils/error-message'
import { useForceCompact, useSetCompactionRatio, useSetForcedTokens } from '../../devtools.api'
import { useDevtoolsStore } from '../../store/devtools.store'
import { DevSection } from '../dev-section'

export function CompactionSection() {
  const selectedChatId = useNavigationStore((s) => s.selectedChatId)
  const compactionRatio = useDevtoolsStore((s) => s.compactionRatio)
  const setCompactionRatio = useDevtoolsStore((s) => s.setCompactionRatio)
  const forcedTokens = useDevtoolsStore((s) => s.forcedTokens)
  const setForcedTokens = useDevtoolsStore((s) => s.setForcedTokens)
  const setRatioOverride = useSetCompactionRatio()
  const setTokensOverride = useSetForcedTokens()
  const forceCompact = useForceCompact()

  const { data: chat } = useChat(selectedChatId)
  const { data: messages = [] } = useMessages(selectedChatId)
  const { data: models = [] } = useModels()
  const model = models.find((m) => m.id === chat?.modelId)
  const realUsed = getContextUsage(messages, model)?.used ?? null

  const handleRatioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setCompactionRatio(v)
    setRatioOverride.mutate(v)
  }

  const handleApply = (tokens: number) => {
    setForcedTokens(tokens)
    setTokensOverride.mutate(tokens)
  }

  const handleClear = () => {
    setForcedTokens(null)
    setTokensOverride.mutate(null)
  }

  const handleForceCompact = () => {
    if (selectedChatId) {
      forceCompact.mutate(selectedChatId)
    }
  }

  return (
    <DevSection title="Compaction">
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>Ratio threshold</span>
            <span className="font-mono text-white">{compactionRatio.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={0.99}
            step={0.01}
            value={compactionRatio}
            onChange={handleRatioChange}
            className="dev-range appearance-none accent-accent-500"
          />
        </div>

        {/* Remounts on chat-switch or override-change so the draft re-seeds from
            the selected chat's real usage without a useEffect. */}
        <TokenFaker
          key={`${selectedChatId ?? 'none'}:${forcedTokens ?? 'real'}`}
          seed={forcedTokens ?? realUsed}
          realUsed={realUsed}
          overridden={forcedTokens != null}
          onApply={handleApply}
          onClear={handleClear}
        />

        <button
          type="button"
          onClick={handleForceCompact}
          disabled={!selectedChatId || forceCompact.isPending}
          className="w-full text-[11px] px-2 py-1.5 rounded bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {forceCompact.isPending ? 'Compacting…' : 'Force compact now'}
        </button>
        {!selectedChatId && (
          <p className="text-[10px] text-white/30 text-center">Open a chat to use</p>
        )}
        {forceCompact.isError && (
          <p className="text-[10px] text-red-400 text-center">
            {errorMessage(forceCompact.error, 'Compaction failed')}
          </p>
        )}
      </div>
    </DevSection>
  )
}

type TokenFakerProps = {
  seed: number | null
  realUsed: number | null
  overridden: boolean
  onApply: (tokens: number) => void
  onClear: () => void
}

function TokenFaker({ seed, realUsed, overridden, onApply, onClear }: TokenFakerProps) {
  const [draft, setDraft] = React.useState(seed == null ? '' : String(seed))
  const parsed = draft.trim() === '' ? Number.NaN : Number.parseInt(draft, 10)
  const valid = Number.isFinite(parsed) && parsed >= 0
  const dirty = String(seed ?? '') !== draft.trim()

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-white/60">
        <span>Fake context tokens</span>
        <span className="font-mono text-white/40">
          {realUsed == null ? '—' : `real ${realUsed}`}
        </span>
      </div>
      <div className="flex gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 text-[11px] px-2 py-1 rounded bg-white/10 text-white placeholder:text-white/30 font-mono outline-none focus:bg-white/15"
        />
        <button
          type="button"
          onClick={() => {
            if (valid) {
              onApply(parsed)
            }
          }}
          disabled={!valid || (overridden && !dirty)}
          className="text-[11px] px-2 py-1 rounded bg-accent-500/90 text-black font-medium hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          Apply
        </button>
        {overridden && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] px-2 py-1 rounded bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
