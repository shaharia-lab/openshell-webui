import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { api } from './client'
import { errorMessage } from './errors'
import { qk } from './queries'
import type { RpcMethod, RpcRequest, RpcResponse } from './rpc'

export interface RpcVars<M extends RpcMethod> {
  /** Workspace the call runs in. */
  ws: string
  body: RpcRequest<M>
}

interface RpcMutationOptions<M extends RpcMethod> {
  /** Toast after success; a function can describe the result. */
  success?: string | ((res: RpcResponse<M>, vars: RpcVars<M>) => string | undefined)
  /**
   * Toast failures. Dialogs turn this off and show the error inline, so the
   * user can fix the input.
   */
  toastErrors?: boolean
  onSuccess?: (res: RpcResponse<M>, vars: RpcVars<M>) => void
}

/**
 * Runs a write method on a gateway and refreshes everything cached for that
 * gateway (and the audit log) afterwards.
 */
export function useRpc<M extends RpcMethod>(
  gw: string,
  method: M,
  { success, toastErrors = true, onSuccess }: RpcMutationOptions<M> = {},
) {
  const qc = useQueryClient()
  return useMutation<RpcResponse<M>, Error, RpcVars<M>>({
    mutationKey: ['rpc', gw, method],
    mutationFn: ({ ws, body }) => api.call(gw, method, body, ws),
    onSuccess: (res, vars) => {
      const msg = typeof success === 'function' ? success(res, vars) : success
      if (msg) toast.success(msg)
      onSuccess?.(res, vars)
    },
    onError: (err) => {
      if (toastErrors) toast.error(`${method} failed`, { description: errorMessage(err) })
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.gw(gw) }),
        qc.invalidateQueries({ queryKey: ['audit'] }),
      ]),
  })
}
