import React from 'react'
import { Button } from '@/components/button'
import { IconFileText } from '@/components/icons/icon-file-text'
import { IconPlus } from '@/components/icons/icon-plus'
import { IconTrash } from '@/components/icons/icon-trash'
import { errorMessage } from '@/utils/error-message'
import {
  useAddProjectFile,
  useDeleteProjectFile,
  useProjectFiles,
} from '../hooks/use-project-files'

const ACCEPT =
  '.md,.txt,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.cpp,.h,.cs,.php,.sh,.yaml,.yml,.toml,.sql'

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}

type FilesCardProps = {
  projectId: string
}

export function FilesCard({ projectId }: FilesCardProps) {
  const { data: files = [] } = useProjectFiles(projectId)
  const addFile = useAddProjectFile()
  const deleteFile = useDeleteProjectFile()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    e.target.value = ''
    try {
      const buffer = await file.arrayBuffer()
      const data = toBase64(new Uint8Array(buffer))
      await addFile.mutateAsync({ projectId, name: file.name, data, mediaType: file.type })
    } catch (err) {
      setUploadError(errorMessage(err, 'Upload failed'))
    }
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconFileText width={16} className="text-subtle" />
          <span className="text-sm font-medium text-foreground">Files</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={addFile.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <IconPlus width={14} />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {files.length === 0 && !addFile.isPending && (
        <p className="text-xs text-subtle italic">No files attached.</p>
      )}

      {files.map((file) => (
        <div
          key={file.id}
          className="group flex items-center gap-2 p-2.5 rounded-lg border border-border bg-surface"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">{file.name}</p>
            <p className="text-2xs text-subtle">{formatSize(file.byteSize)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => deleteFile.mutate({ id: file.id, projectId })}
          >
            <IconTrash width={13} />
          </Button>
        </div>
      ))}

      {addFile.isPending && <p className="text-xs text-subtle">Uploading…</p>}

      {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
    </div>
  )
}
