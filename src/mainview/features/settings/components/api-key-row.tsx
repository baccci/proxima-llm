import React from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/button'
import { IconCheck } from '@/components/icons/icon-check'
import { IconEye } from '@/components/icons/icon-eye'
import { IconEyeOff } from '@/components/icons/icon-eye-off'
import { Input } from '@/components/input'
import { useApiKeyStatus } from '@/features/settings/hooks/use-settings'
import { settings } from '@/features/settings/settings.api'
import type { ProviderId } from '../constants/providers'

type KeyFormValues = {
  key: string
}

type ApiKeyRowProps = {
  provider: ProviderId
  placeholder?: string
  accent?: string
  foreground?: string
}

export function ApiKeyRow({ provider, placeholder, accent, foreground }: ApiKeyRowProps) {
  const { data } = useApiKeyStatus(provider)
  const [visible, setVisible] = React.useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isDirty },
  } = useForm<KeyFormValues>()

  const typed = watch('key')
  const hasInput = (typed?.length ?? 0) > 0
  const isConfigured = data?.configured ?? false

  async function onSubmit({ key }: KeyFormValues) {
    await settings.setApiKey(provider, key)
    reset()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">API Key</span>
        {isConfigured && (
          <span className="flex items-center gap-1 text-xs text-success">
            <IconCheck width={12} /> Configured
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={visible ? 'text' : 'password'}
            placeholder={isConfigured ? '••••••••••••••••' : (placeholder ?? 'sk-…')}
            {...register('key', { required: true })}
            className={hasInput ? 'pr-9' : ''}
          />
          {hasInput && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-foreground transition-colors"
            >
              {visible ? <IconEyeOff width={14} /> : <IconEye width={14} />}
            </button>
          )}
        </div>
        <Button
          type="submit"
          variant="brand"
          size="md"
          disabled={!isDirty}
          style={accent ? { backgroundColor: accent, color: foreground } : undefined}
          className={accent ? 'hover:opacity-90' : undefined}
        >
          Save
        </Button>
      </form>
    </div>
  )
}
