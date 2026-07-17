import { type MemoryScope, MemorySource } from '@shared/schemas/memory-slice.schema'
import React from 'react'
import { useForm } from 'react-hook-form'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { IconPencil } from '@/components/icons/icon-pencil'
import { IconPlus } from '@/components/icons/icon-plus'
import { IconTrash } from '@/components/icons/icon-trash'
import { Input } from '@/components/input'
import {
  useDeleteMemorySlice,
  useMemorySlices,
  useUpsertMemorySlice,
} from '../hooks/use-memory-slices'

interface Props {
  scope: MemoryScope
  projectId: string | null
}

interface SliceFormFields {
  title: string
  content: string
}

export function MemorySliceList({ scope, projectId }: Props) {
  const { data: slices = [] } = useMemorySlices(scope, projectId)
  const upsert = useUpsertMemorySlice()
  const remove = useDeleteMemorySlice()
  const [editingId, setEditingId] = React.useState<string | 'new' | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<SliceFormFields>({ defaultValues: { title: '', content: '' } })

  function openNew() {
    reset({ title: '', content: '' })
    setEditingId('new')
  }

  function openEdit(slice: { id: string; title: string; content: string }) {
    reset({ title: slice.title, content: slice.content })
    setEditingId(slice.id)
  }

  function cancel() {
    reset()
    setEditingId(null)
  }

  async function onSubmit(data: SliceFormFields) {
    await upsert.mutateAsync({
      id: editingId !== 'new' ? (editingId ?? undefined) : undefined,
      scope,
      projectId,
      title: data.title,
      content: data.content,
    })
    cancel()
  }

  const sliceEditor = (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
      <Input placeholder="Title" autoFocus {...register('title', { required: true })} />
      <textarea
        placeholder="Content"
        rows={4}
        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-subtle outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-ring resize-none"
        {...register('content', { required: true })}
      />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          Cancel
        </Button>
        <Button type="submit" variant="brand" size="sm" disabled={isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  )

  return (
    <div className="flex flex-col gap-2">
      {slices.length === 0 && editingId === null && (
        <p className="text-xs text-subtle italic">No memory slices yet.</p>
      )}

      {slices.map((slice) =>
        editingId === slice.id ? (
          <div key={slice.id}>{sliceEditor}</div>
        ) : (
          <div
            key={slice.id}
            className="group flex items-start gap-2 p-3 rounded-lg border border-border bg-surface"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">{slice.title}</span>
                {slice.source === MemorySource.enum.model && <Badge variant="brand">AI</Badge>}
              </div>
              <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">
                {slice.content}
              </p>
            </div>
            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(slice)}>
                <IconPencil width={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove.mutate({ id: slice.id, scope, projectId })}
              >
                <IconTrash width={13} />
              </Button>
            </div>
          </div>
        ),
      )}

      {editingId === 'new' && sliceEditor}

      {editingId === null && (
        <Button type="button" variant="ghost" size="sm" onClick={openNew} className="self-start">
          <IconPlus width={13} />
          Add memory
        </Button>
      )}
    </div>
  )
}
