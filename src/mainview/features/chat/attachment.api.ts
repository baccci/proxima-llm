import { useQuery } from '@tanstack/react-query'
import { electroview, rpcRequest as req } from '@/lib/rpc.client'

export const attachmentQueryKey = (id: string) => ['attachment', id] as const

export async function uploadAttachment(
  chatId: string,
  file: File,
): Promise<import('@shared/schemas/attachment.schema').AttachmentDTO> {
  const data = await fileToBase64(file)
  return req().uploadAttachment({ chatId, name: file.name, data, mediaType: file.type })
}

export function useAttachment(id: string) {
  return useQuery({
    queryKey: attachmentQueryKey(id),
    queryFn: () => electroview.rpc?.request.getAttachment({ id }),
    staleTime: Infinity,
  })
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
