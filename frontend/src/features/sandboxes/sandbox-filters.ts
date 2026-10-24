import type { Sandbox } from '@/gen/openshell'
import { phaseLabel, sandboxPhase } from '@/lib/sandbox'

export interface SandboxFilters {
  /** A SandboxPhase, or empty for any. */
  phase: string
  /** An attached provider name, or empty for any. */
  provider: string
  /** Label selector as the CLI takes it: `key=value,key2=value2`; a bare key means "has the label". */
  labels: string
}

export type LabelTerm = { key: string; value?: string }

/** Parses a label selector; throws with a readable message when a term is malformed. */
export function parseSelector(selector: string): LabelTerm[] {
  return selector
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const i = t.indexOf('=')
      const key = (i < 0 ? t : t.slice(0, i)).trim()
      if (!key) throw new Error(`"${t}" needs a label key, as in team=ml.`)
      return i < 0 ? { key } : { key, value: t.slice(i + 1).trim() }
    })
}

/** Whether a sandbox passes the filters. A malformed selector matches nothing. */
export function matchesFilters(s: Sandbox, f: SandboxFilters, terms: LabelTerm[]): boolean {
  if (f.phase && sandboxPhase(s) !== f.phase) return false
  if (f.provider && !(s.spec?.providers ?? []).includes(f.provider)) return false
  const labels = s.metadata?.labels ?? {}
  return terms.every((t) => (t.value === undefined ? t.key in labels : labels[t.key] === t.value))
}

/** `key=value` strings of a sandbox's labels, sorted. */
export const labelPairs = (s: Sandbox) =>
  Object.entries(s.metadata?.labels ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .sort()

/** Whether the free-text filter matches the sandbox's name, workspace, phase, image, providers or labels. */
export function matchesText(s: Sandbox, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [
    s.metadata?.name,
    s.metadata?.workspace,
    phaseLabel(sandboxPhase(s)),
    s.spec?.template?.image,
    ...(s.spec?.providers ?? []),
    ...labelPairs(s),
  ].some((v) => v?.toLowerCase().includes(needle))
}
