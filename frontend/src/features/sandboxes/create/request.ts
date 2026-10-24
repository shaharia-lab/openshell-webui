import type { ServiceRow } from './services'
import type { CreateSandboxRequest, SandboxRestartPolicy, SandboxSpec } from '@/gen/openshell'
import type { SandboxPolicy } from '@/gen/sandbox'
import { shellSplit } from '@/lib/shell'
import { rowsToMap, type KeyValue } from '@/lib/validation'

export interface CreateSandboxInput {
  name: string
  image: string
  template: string
  restart: string
  command: string
  cpu: string
  memory: string
  gpu: boolean
  gpuCount: string
  providers: string[]
  env: KeyValue[]
  labels: KeyValue[]
  services: ServiceRow[]
}

/**
 * The CreateSandbox request for the dialog's values. With a workload template
 * the gateway takes image, resources, GPUs and environment from the template
 * and rejects them on the request, so only the per-sandbox fields (command,
 * providers, policy, restart policy, labels, services) are sent.
 */
export function createSandboxRequest(
  v: CreateSandboxInput,
  policy?: SandboxPolicy,
): CreateSandboxRequest {
  const spec: SandboxSpec = { tty: true }
  if (!v.template) {
    spec.template = {}
    if (v.image) spec.template.image = v.image
    const limits: Record<string, string> = {}
    if (v.cpu) limits.cpu = v.cpu
    if (v.memory) limits.memory = v.memory
    if (Object.keys(limits).length) spec.template.resources = { limits }
    const env = rowsToMap(v.env)
    if (Object.keys(env).length) spec.environment = env
    if (v.gpu) spec.resource_requirements = { gpu: v.gpuCount ? { count: Number(v.gpuCount) } : {} }
  }
  if (v.command.trim()) spec.command = shellSplit(v.command)
  if (v.providers.length) spec.providers = v.providers
  if (v.restart) spec.restart_policy = v.restart as SandboxRestartPolicy
  if (policy) spec.policy = policy

  const body: CreateSandboxRequest = { name: v.name, spec }
  if (v.template) body.workload_template = v.template
  const labels = rowsToMap(v.labels)
  if (Object.keys(labels).length) body.labels = labels
  if (v.services.length) {
    body.service_exposures = v.services.map((s) => ({
      service: s.name.trim(),
      target_port: Number(s.port),
      authorization_mode: s.auth,
    }))
  }
  return body
}
