import { api } from '@/api/client'
import type { NetworkPolicyRule, ProcessPolicy, SandboxPolicy } from '@/gen/sandbox'
import { buildRules, type RuleRow } from '@/lib/policy'

/** Filesystem and Landlock settings as the form edits them: one path per line. */
export interface FilesystemForm {
  includeWorkdir: boolean
  readOnly: string
  readWrite: string
  landlock: string
}

/** Process identity; empty fields leave the choice to the runtime. */
export interface ProcessForm {
  user: string
  group: string
}

/** Where the new sandbox's policy starts, and how the user edits it. */
export interface PolicyBuilderState {
  /** Copied policy of another sandbox; null means the gateway default. */
  base: SandboxPolicy | null
  baseName: string
  /** Rules of the copied policy the form cannot show (kept as they are). */
  advanced: Record<string, NetworkPolicyRule>
  /** YAML text while editing as YAML; null in form mode. */
  yaml: string | null
  /** Custom filesystem settings; null keeps the base's (or the default). */
  filesystem: FilesystemForm | null
  /** Custom process identity; null keeps the base's (or the default). */
  process: ProcessForm | null
}

export const initialPolicyBuilder: PolicyBuilderState = {
  base: null,
  baseName: '',
  advanced: {},
  yaml: null,
  filesystem: null,
  process: null,
}

// The gateway's restrictive default (openshell-policy restrictive_default_policy).
export const DEFAULT_READ_ONLY = [
  '/bin',
  '/usr',
  '/lib',
  '/proc',
  '/dev/urandom',
  '/etc',
  '/var/log',
]
export const DEFAULT_READ_WRITE = ['/tmp', '/dev/null']

export const LANDLOCK_OPTIONS = [
  { value: 'best_effort', label: 'Best effort' },
  { value: 'hard_requirement', label: 'Hard requirement' },
]

/** The form values for the filesystem section, starting from a policy or the default. */
export function filesystemForm(policy: SandboxPolicy | null): FilesystemForm {
  const fs = policy?.filesystem
  return {
    includeWorkdir: fs ? !!fs.include_workdir : true,
    readOnly: (fs ? (fs.read_only ?? []) : DEFAULT_READ_ONLY).join('\n'),
    readWrite: (fs ? (fs.read_write ?? []) : DEFAULT_READ_WRITE).join('\n'),
    landlock: policy?.landlock?.compatibility || 'best_effort',
  }
}

export const processForm = (policy: SandboxPolicy | null): ProcessForm => ({
  user: policy?.process?.run_as_user ?? '',
  group: policy?.process?.run_as_group ?? '',
})

const paths = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** Returns why a path list is invalid, or null. */
export function pathsError(text: string): string | null {
  for (const p of paths(text)) {
    if (!p.startsWith('/')) return `${p} must be an absolute path.`
    if (p.split('/').includes('..')) return `${p} must not contain "..".`
  }
  return null
}

/** Returns why a process identity is invalid, or null: `sandbox` or a numeric ID other than 0. */
export function identityError(value: string): string | null {
  const v = value.trim()
  if (!v || v === 'sandbox') return null
  const n = /^\d+$/.test(v) ? Number(v) : NaN
  if (n >= 1 && n <= 0xfffffffe) return null
  return v === '0' ? 'Root (0) is not allowed.' : `${v} must be sandbox or a numeric ID.`
}

/** The policy document the form describes (network rules only for the gateway default). */
export function formPolicy(state: PolicyBuilderState, rows: RuleRow[]): SandboxPolicy {
  const rules = buildRules(rows, Object.keys(state.advanced))
  const network_policies = {
    ...state.advanced,
    ...Object.fromEntries(rules.map((r) => [r.name!, r])),
  }
  const doc: SandboxPolicy = state.base
    ? { ...structuredClone(state.base), network_policies }
    : { network_policies }
  if (state.filesystem) {
    const fs = state.filesystem
    doc.filesystem = {
      include_workdir: fs.includeWorkdir,
      read_only: paths(fs.readOnly),
      read_write: paths(fs.readWrite),
    }
    doc.landlock = { compatibility: fs.landlock }
  }
  if (state.process) {
    const process: ProcessPolicy = {}
    if (state.process.user.trim()) process.run_as_user = state.process.user.trim()
    if (state.process.group.trim()) process.run_as_group = state.process.group.trim()
    // No identity at all leaves the choice to the runtime (the image's user).
    if (Object.keys(process).length) doc.process = process
    else delete doc.process
  }
  return doc
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
  const fsError =
    state.filesystem &&
    (pathsError(state.filesystem.readOnly) || pathsError(state.filesystem.readWrite))
  if (fsError) throw new Error(`Filesystem: ${fsError}`)
  const idError =
    state.process && (identityError(state.process.user) || identityError(state.process.group))
  if (idError) throw new Error(`Process: ${idError}`)
  const doc = formPolicy(state, rows)
  if (!state.base && !state.filesystem && !state.process) {
    return { rules: Object.values(doc.network_policies ?? {}) }
  }
  return { policy: await api.convertPolicy(JSON.stringify(doc)), rules: [] }
}
