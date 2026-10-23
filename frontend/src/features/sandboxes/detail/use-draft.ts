import { useGwCall } from '@/api/queries'
import type { SandboxRef } from '@/lib/sandbox'

/** All proposals for a sandbox; shared by the tab and its badge. */
export function useDraft(gw: string, ref: SandboxRef) {
  return useGwCall(gw, 'GetDraftPolicy', ref.workspace, { sandbox: ref.name, status_filter: '' })
}

export function usePendingProposals(gw: string, ref: SandboxRef): number {
  const { data } = useDraft(gw, ref)
  return (data?.chunks ?? []).filter((c) => c.status === 'pending').length
}
