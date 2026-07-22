import type { ModelDTO } from '@shared/schemas/model.schema'
import { queryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest as req } from '@/lib/rpc.client'

export const models = {
  update: async (input: Partial<ModelDTO> & { id: string }) => {
    const updated = await req().updateModel(input)
    queryClient.invalidateQueries({ queryKey: queryKeys.models() })
    return updated
  },
}
