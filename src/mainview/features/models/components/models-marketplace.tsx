import { getProvider, PROVIDER_IDS, ProviderId } from '@shared/providers/registry'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconSearch } from '@/components/icons/icon-search'
import { IconX } from '@/components/icons/icon-x'
import { Modal, modal } from '@/components/modal'
import { ModalNavBody } from '@/components/modal/modal-nav'
import { Pagination } from '@/components/pagination'
import { PROVIDER_LOGOS } from '@/entities/provider'
import { useModelSyncInfo } from '@/features/models/hooks/use-model-sync-info'
import { useModels } from '@/features/models/hooks/use-models'
import { settings } from '@/features/settings/settings.api'
import { useIsDark } from '@/hooks/use-is-dark'
import { MARKETPLACE_MODAL_ID } from './marketplace.constants'
import { ModelCard } from './model-card'

const PAGE_SIZE = 24

function prettifyProvider(provider: string): string {
  try {
    return getProvider(provider).label
  } catch {
    return provider.charAt(0).toUpperCase() + provider.slice(1)
  }
}

// Brand meta + logo for a known provider; null for custom/unknown providers so
// the tab falls back to neutral styling instead of throwing.
function providerBrand(provider: string) {
  if (!(PROVIDER_IDS as readonly string[]).includes(provider)) return null
  return { meta: getProvider(provider), Logo: PROVIDER_LOGOS[provider as ProviderId] }
}

function syncedAgo(ts: number | null | undefined): string {
  if (ts == null) return 'Never synced'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function ModelsMarketplace() {
  const { data: allModels = [] } = useModels()
  const { data: syncInfo } = useModelSyncInfo()
  const isDark = useIsDark()
  const [search, setSearch] = React.useState('')
  const [activeProvider, setActiveProvider] = React.useState<string | null>(null)
  const [syncing, setSyncing] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [filterMode, setFilterMode] = React.useState<'all' | 'enabled'>('all')

  const providers = [
    ...PROVIDER_IDS.filter((p) => allModels.some((m) => m.provider === p)),
    ...allModels
      .map((m) => m.provider)
      .filter((p) => !(PROVIDER_IDS as readonly string[]).includes(p))
      .filter((p, i, arr) => arr.indexOf(p) === i),
  ]

  const currentProvider = activeProvider ?? providers[0] ?? PROVIDER_IDS[0]

  const filtered = allModels
    .filter((m) => {
      if (m.provider !== currentProvider) return false
      if (filterMode === 'enabled' && !m.isEnabled) return false
      if (!search) return true
      const q = search.toLowerCase()
      return m.displayName.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    })
    .sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled))

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const safePage = Math.min(page, Math.max(1, pageCount))
  const visibleModels = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Split the visible page into enabled/disabled groups; only show group headings
  // when both are present so a single-state page stays uncluttered.
  const visibleEnabled = visibleModels.filter((m) => m.isEnabled)
  const visibleDisabled = visibleModels.filter((m) => !m.isEnabled)
  const showGroupHeads = visibleEnabled.length > 0 && visibleDisabled.length > 0

  const enabledCount = allModels.filter((m) => m.provider === currentProvider && m.isEnabled).length

  async function handleResync() {
    setSyncing(true)
    try {
      await settings.syncModels()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Modal id={MARKETPLACE_MODAL_ID} label="Models" overlayClassName="bg-black/50">
      <Modal.Content className="w-[900px] max-w-[95vw] rounded-xl border border-border bg-panel shadow-modal">
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <div>
            <h2 className="text-md font-semibold text-foreground">Models</h2>
            <p className="text-2xs text-subtle mt-0.5">
              Enable models to make them available in the composer
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xs text-subtle">{syncedAgo(syncInfo?.lastSyncAt)}</span>
              <button
                type="button"
                onClick={handleResync}
                disabled={syncing}
                className="text-2xs text-selected-foreground hover:text-selected-border transition-colors disabled:opacity-50 cursor-pointer"
              >
                {syncing ? 'Syncing…' : 'Resync'}
              </button>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => modal.close(MARKETPLACE_MODAL_ID)}
              className="ml-4 rounded-lg p-1 text-subtle hover:text-foreground hover:bg-surface-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <IconX width={16} />
            </button>
          </div>
        </div>

        <ModalNavBody
          nav={providers.map((p) => {
            const selected = currentProvider === p
            const brand = providerBrand(p)
            const Logo = brand?.Logo
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setActiveProvider(p)
                  setSearch('')
                  setPage(1)
                }}
                style={(() => {
                  if (!selected || !brand) return undefined
                  const c = isDark ? brand.meta.colors.dark : brand.meta.colors.light
                  return { backgroundColor: c.accent, color: c.foreground, borderColor: c.accent }
                })()}
                className={cn(
                  'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg border border-transparent text-sm transition-colors cursor-pointer text-left',
                  selected && !brand && 'bg-surface-hover text-foreground font-medium',
                  selected && brand && 'font-medium',
                  !selected && 'text-muted hover:bg-surface-hover hover:text-foreground',
                )}
              >
                {Logo && (
                  // Wrapper span sets `color` so the currentColor-filled logo picks
                  // up the brand accent even though the icon doesn't forward style.
                  <span
                    className="shrink-0"
                    style={
                      selected || !brand
                        ? undefined
                        : {
                            color: (isDark ? brand.meta.colors.dark : brand.meta.colors.light)
                              .accent,
                          }
                    }
                  >
                    <Logo width={16} />
                  </span>
                )}
                {prettifyProvider(p)}
              </button>
            )
          })}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <IconSearch
                  width={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="Search models…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-surface text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setPage(1)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-foreground"
                  >
                    <IconX width={13} />
                  </button>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                {(['all', 'enabled'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setFilterMode(mode)
                      setPage(1)
                    }}
                    className={cn(
                      'px-3 h-8 rounded-lg border text-xs transition-colors cursor-pointer',
                      filterMode === mode
                        ? 'border-selected-border bg-selected-surface text-selected-foreground'
                        : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
                    )}
                  >
                    {mode === 'enabled' ? `Enabled (${enabledCount})` : 'All'}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[440px] overflow-y-auto pr-1 pb-1">
              {filtered.length === 0 &&
              currentProvider === ProviderId.enum.openrouter &&
              !search &&
              filterMode === 'all' ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <p className="text-sm text-muted">No OpenRouter models synced yet.</p>
                  <button
                    type="button"
                    onClick={handleResync}
                    disabled={syncing}
                    className="text-sm text-selected-foreground hover:text-selected-border transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {syncing ? 'Syncing…' : 'Sync models now'}
                  </button>
                </div>
              ) : filtered.length === 0 && filterMode === 'enabled' ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted">No enabled models yet — toggle some on.</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted">No models match your search.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {visibleEnabled.length > 0 && (
                    <section>
                      {showGroupHeads && (
                        <h3 className="mb-2 text-2xs font-semibold text-subtle uppercase tracking-wider">
                          Enabled
                        </h3>
                      )}
                      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
                        {visibleEnabled.map((m) => (
                          <ModelCard key={m.id} model={m} />
                        ))}
                      </div>
                    </section>
                  )}
                  {visibleDisabled.length > 0 && (
                    <section>
                      {showGroupHeads && (
                        <h3 className="mb-2 text-2xs font-semibold text-subtle uppercase tracking-wider">
                          Available
                        </h3>
                      )}
                      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
                        {visibleDisabled.map((m) => (
                          <ModelCard key={m.id} model={m} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            <div className="flex h-7 items-center justify-center">
              <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
            </div>
          </div>
        </ModalNavBody>
      </Modal.Content>
    </Modal>
  )
}
