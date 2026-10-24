import type { SandboxWorkloadTemplate } from '@/gen/openshell'

/** A template's resource requests, e.g. "cpu 2, memory 4Gi, gpu 1". */
export function templateResources(t: SandboxWorkloadTemplate): string {
  const r = t.spec?.workload?.resources
  return [
    r?.cpu && `cpu ${r.cpu}`,
    r?.memory && `memory ${r.memory}`,
    r?.gpu && `gpu ${r.gpu.count ?? 'default'}`,
  ]
    .filter(Boolean)
    .join(', ')
}

/** One line describing what a sandbox inherits from the template. */
export function templateSummary(t: SandboxWorkloadTemplate): string {
  const w = t.spec?.workload
  const env = Object.keys(w?.environment ?? {})
  return [
    w?.image || "gateway's default image",
    templateResources(t),
    env.length && `env ${env.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Parses the driver config field: empty, or a JSON object keyed by driver. */
export function parseDriverConfig(text: string): Record<string, unknown> | undefined {
  if (!text.trim()) return undefined
  const v: unknown = JSON.parse(text)
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new Error('Enter a JSON object keyed by driver, e.g. {"kubernetes": {...}}.')
  return v as Record<string, unknown>
}
