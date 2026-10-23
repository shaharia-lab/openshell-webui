import { api } from '@/api/client'
import type { NetworkPolicyRule, SandboxPolicy } from '@/gen/sandbox'
import { buildRules, type RuleRow } from '@/lib/policy'

/** Where the new sandbox's policy starts, and how the user edits it. */
export interface PolicyBuilderState {
  /** Copied policy of another sandbox; null means the gateway default. */
  base: SandboxPolicy | null
  baseName: string
  /** Rules of the copied policy the form cannot show (kept as they are). */
  advanced: Record<string, NetworkPolicyRule>
  /** YAML text while editing as YAML; null in form mode. */
  yaml: string | null
}

export const initialPolicyBuilder: PolicyBuilderState = {
  base: null,
  baseName: '',
  advanced: {},
  yaml: null,
}

/** The policy document the form describes (network rules only for the gateway default). */
export function formPolicy(state: PolicyBuilderState, rows: RuleRow[]): SandboxPolicy {
  const rules = buildRules(rows, Object.keys(state.advanced))
  const network_policies = {
    ...state.advanced,
    ...Object.fromEntries(rules.map((r) => [r.name!, r])),
  }
  return state.base ? { ...structuredClone(state.base), network_policies } : { network_policies }
}

/**
 * Returns either a full policy to send with CreateSandbox, or rules to merge
 * into the gateway default after creation (which keeps its filesystem and
 * process sections).
 */
export async function resolvePolicy(
  state: PolicyBuilderState,
  rows: RuleRow[],
): Promise<{ policy?: SandboxPolicy; rules: NetworkPolicyRule[] }> {
  if (state.yaml !== null) {
    const p = await api.convertPolicy(state.yaml)
    const onlyNetwork = Object.keys(p).every((k) => k === 'network_policies' || k === 'version')
    if (!state.base && onlyNetwork) return { rules: Object.values(p.network_policies ?? {}) }
    return { policy: p, rules: [] }
  }
  const doc = formPolicy(state, rows)
  if (!state.base) return { rules: Object.values(doc.network_policies ?? {}) }
  return { policy: await api.convertPolicy(JSON.stringify(doc)), rules: [] }
}
