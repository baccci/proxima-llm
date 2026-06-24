import React from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/button'
import { IconAlertTriangle } from '@/components/icons/icon-alert-triangle'
import { IconCheckCircle } from '@/components/icons/icon-check-circle'
import { IconEye } from '@/components/icons/icon-eye'
import { IconEyeOff } from '@/components/icons/icon-eye-off'
import { Input } from '@/components/input'
import { useApiKeyStatus } from '@/features/settings/hooks/use-settings'
import { settings } from '@/features/settings/settings.api'

interface KeyFormValues {
  key: string
}

function ApiKeyRow({ provider, label }: { provider: string; label: string }) {
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

  const isConfigured = data?.configured ?? false

  async function onSubmit({ key }: KeyFormValues) {
    await settings.setApiKey(provider, key)
    reset()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {isConfigured ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <IconCheckCircle width={12} /> Configured
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-warning">
            <IconAlertTriangle width={12} /> Not set
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={visible ? 'text' : 'password'}
            placeholder={isConfigured ? '••••••••••••••••' : 'sk-ant-…'}
            {...register('key', { required: true })}
            className={typed ? 'pr-9' : ''}
          />
          {typed && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-foreground transition-colors"
            >
              {visible ? <IconEyeOff width={14} /> : <IconEye width={14} />}
            </button>
          )}
        </div>
        <Button type="submit" variant="brand" size="md" disabled={!isDirty}>
          Save
        </Button>
      </form>
    </div>
  )
}

export function ApiKeysSection() {
  return (
    <div className="space-y-6">
      <ApiKeyRow provider="anthropic" label="Anthropic API key" />
      <ApiKeyRow provider="openrouter" label="OpenRouter API key" />
    </div>
  )
}
