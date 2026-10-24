import type { NetworkPolicyRule } from '@/gen/sandbox'

// The gateway's refusal when a policy binds a credential to a provider the
// sandbox does not attach (openshell-server grpc/policy.rs).
const UNATTACHED =
  /credential_binding references provider '([^']+)', but that provider is not attached/

/** The provider named by a gateway "not attached" refusal, if `err` is one. */
export function unattachedBindingProvider(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return UNATTACHED.exec(msg)?.[1] ?? null
}

/** Providers that the rules' credential bindings need, in rule order, without duplicates. */
export function boundProviders(rules: NetworkPolicyRule[]): string[] {
  const names = rules.flatMap((r) =>
    (r.endpoints ?? []).flatMap((e) => e.credential_binding?.provider ?? []),
  )
  return [...new Set(names.filter(Boolean))]
}
