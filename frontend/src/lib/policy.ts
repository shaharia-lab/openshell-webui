import { stringify } from 'yaml'

import type { PolicyMergeOperation } from '@/gen/openshell'
import type {
  NetworkAccessPreset,
  NetworkEndpoint,
  NetworkPolicyRule,
  SandboxPolicy,
} from '@/gen/sandbox'
import { enumLabel } from './format'

/** Rules the gateway adds for attached providers; users cannot edit them. */
export const PROVIDER_RULE_PREFIX = '_provider_'
export const isProviderRule = (name: string) => name.startsWith(PROVIDER_RULE_PREFIX)

export const ACCESS_OPTIONS: { value: NetworkAccessPreset; label: string; hint: string }[] = [
  { value: 'NETWORK_ACCESS_PRESET_READ_ONLY', label: 'read-only', hint: 'GET, HEAD, OPTIONS' },
  {
    value: 'NETWORK_ACCESS_PRESET_READ_WRITE',
    label: 'read-write',
    hint: 'adds POST, PUT, PATCH, DELETE',
  },
  { value: 'NETWORK_ACCESS_PRESET_FULL', label: 'full', hint: 'every method' },
]

const ENFORCE = 'NETWORK_ENFORCEMENT_MODE_ENFORCE'

/**
 * One editable row: one binary may reach one host:port. Rows that share an
 * endpoint and access level become one rule with several binaries.
 */
export interface RuleRow {
  binary: string
  /** host:port */
  endpoint: string
  access: NetworkAccessPreset
  /** L4 pass-through: no HTTP inspection, access control or credential injection. */
  l4: boolean
  /** Name of the existing rule this row came from, if any. */
  rule?: string
}

export const emptyRuleRow = (): RuleRow => ({
  binary: '',
  endpoint: '',
  access: 'NETWORK_ACCESS_PRESET_READ_WRITE',
  l4: false,
})

const ENDPOINT_RE = /^([A-Za-z0-9*.-]+):(\d{1,5})$/

export const isBlankRow = (r: RuleRow) => !r.binary.trim() && !r.endpoint.trim()

/** Returns why a row is invalid, or null. Blank rows are valid (ignored). */
export function ruleRowError(r: RuleRow): string | null {
  const bin = r.binary.trim()
  const ep = r.endpoint.trim()
  if (!bin && !ep) return null
  if (!bin) return 'Enter the binary path, for example /usr/bin/curl.'
  if (!/^\/\S*$/.test(bin)) return `${bin} must be an absolute path.`
  const m = ep.match(ENDPOINT_RE)
  if (!m) return `${ep || 'Endpoint'} must be host:port, for example api.github.com:443.`
  const port = Number(m[2])
  if (port < 1 || port > 65535) return `Port ${m[2]} must be 1 to 65535.`
  return null
}

/** The access level of an endpoint as shown to users: read-only, read-write, full, L7 (own rules) or L4. */
export function endpointMode(e: NetworkEndpoint): string {
  if (e.protocol !== 'rest') return 'L4'
  // HTTP inspection with its own allow rules instead of an access preset.
  if (!e.access) return 'L7'
  return enumLabel(e.access, 'NETWORK_ACCESS_PRESET_').toLowerCase().replace(' ', '-')
}

const hostPort = (e: { host?: string; port?: number }) =>
  `${(e.host ?? '').toLowerCase()}:${e.port}`

function toEndpoint(
  host: string,
  port: number,
  l4: boolean,
  access: NetworkAccessPreset,
): NetworkEndpoint {
  return l4 ? { host, port } : { host, port, protocol: 'rest', access, enforcement: ENFORCE }
}

/** "allow_api_github_com_443", made unique against `used`. */
function ruleName(host: string, port: number, used: Set<string>): string {
  const base = `allow_${host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')}_${port}`
  let n = base
  for (let i = 2; used.has(n); i++) n = `${base}_${i}`
  used.add(n)
  return n
}

/**
 * Groups rows into named network rules. Rows copied from one existing rule
 * become that rule again, but only when they still cover every binary x
 * endpoint pair; otherwise the rebuilt rule would allow pairs no row asks
 * for. Other rows become one rule per endpoint and access level.
 *
 * `taken` are rule names that must not be reused. Throws on invalid rows and
 * on one host:port with two access levels (the gateway would keep only one).
 */
export function buildRules(rows: RuleRow[], taken: string[] = []): NetworkPolicyRule[] {
  const parsed = rows
    .filter((r) => !isBlankRow(r))
    .map((r) => {
      const err = ruleRowError(r)
      if (err) throw new Error(err)
      const [, host, port] = r.endpoint.trim().match(ENDPOINT_RE)!
      const key = [host.toLowerCase(), port, r.l4 ? 'l4' : r.access].join('|')
      return { ...r, binary: r.binary.trim(), host, port: Number(port), key }
    })

  const used = new Set(taken)
  const rules: NetworkPolicyRule[] = []
  const loose: typeof parsed = []

  const byOrigin = new Map<string, typeof parsed>()
  for (const r of parsed) {
    if (!r.rule) loose.push(r)
    else byOrigin.set(r.rule, [...(byOrigin.get(r.rule) ?? []), r])
  }
  for (const [origin, group] of byOrigin) {
    const endpoints = new Map(group.map((r) => [r.key, r]))
    const binaries = [...new Set(group.map((r) => r.binary))]
    const pairs = new Set(group.map((r) => `${r.key}>${r.binary}`))
    if (used.has(origin) || pairs.size !== endpoints.size * binaries.length) {
      loose.push(...group)
      continue
    }
    used.add(origin)
    rules.push({
      name: origin,
      endpoints: [...endpoints.values()].map((r) => toEndpoint(r.host, r.port, r.l4, r.access)),
      binaries: binaries.map((path) => ({ path })),
    })
  }

  const groups = new Map<string, { row: (typeof parsed)[number]; binaries: string[] }>()
  for (const r of loose) {
    const g = groups.get(r.key) ?? { row: r, binaries: [] }
    if (!g.binaries.includes(r.binary)) g.binaries.push(r.binary)
    groups.set(r.key, g)
  }
  for (const { row, binaries } of groups.values()) {
    rules.push({
      name: ruleName(row.host, row.port, used),
      endpoints: [toEndpoint(row.host, row.port, row.l4, row.access)],
      binaries: binaries.map((path) => ({ path })),
    })
  }

  assertOneModePerHostPort(rules)
  return rules
}

function assertOneModePerHostPort(rules: NetworkPolicyRule[]) {
  const modes = new Map<string, string>()
  for (const r of rules) {
    for (const e of r.endpoints ?? []) {
      const hp = hostPort(e)
      const mode = endpointMode(e)
      const prev = modes.get(hp)
      if (prev && prev !== mode) {
        throw new Error(
          `${hp} has two access levels (${prev} and ${mode}). Use one access level per host:port.`,
        )
      }
      modes.set(hp, mode)
    }
  }
}

/**
 * Checks new rules against the rules a sandbox already has. The gateway
 * folds a rule for an existing host:port into the existing rule and keeps
 * its access level, so a different level would silently not apply.
 */
export function conflictsWithExisting(
  rules: NetworkPolicyRule[],
  existing: Record<string, NetworkPolicyRule> = {},
): string | null {
  const have = new Map<string, { name: string; mode: string }>()
  for (const [name, r] of Object.entries(existing)) {
    if (isProviderRule(name)) continue
    for (const e of r.endpoints ?? []) have.set(hostPort(e), { name, mode: endpointMode(e) })
  }
  for (const r of rules) {
    for (const e of r.endpoints ?? []) {
      const hit = have.get(hostPort(e))
      if (hit && hit.mode !== endpointMode(e)) {
        return `${e.host}:${e.port} already has rule ${hit.name} with ${hit.mode} access. The gateway keeps that level, so this row cannot change it. Remove ${hit.name} first, or edit the policy as YAML.`
      }
    }
  }
  return null
}

export const addRuleOps = (rules: NetworkPolicyRule[]): PolicyMergeOperation[] =>
  rules.map((rule) => ({ add_rule: { rule_name: rule.name, rule } }))

const SIMPLE_EP_KEYS = new Set(['host', 'port', 'ports', 'protocol', 'access', 'enforcement'])

function isSimpleEndpoint(e: NetworkEndpoint): boolean {
  if (!Object.keys(e).every((k) => SIMPLE_EP_KEYS.has(k))) return false
  if (e.ports && !(e.ports.length === 1 && e.ports[0] === e.port)) return false
  if (e.enforcement && e.enforcement !== ENFORCE) return false
  return e.protocol === 'rest' ? !!e.access : !e.protocol && !e.access
}

/**
 * Splits a policy into editable rows (simple binary -> host:port rules) and
 * advanced rules (L7 rules, paths, TLS options), which are kept unchanged.
 * Provider rules are left out: the gateway manages them.
 */
export function splitPolicyRules(policy?: SandboxPolicy): {
  rows: RuleRow[]
  advanced: Record<string, NetworkPolicyRule>
} {
  const rows: RuleRow[] = []
  const advanced: Record<string, NetworkPolicyRule> = {}
  for (const [name, r] of Object.entries(policy?.network_policies ?? {})) {
    if (isProviderRule(name)) continue
    const simple =
      Object.keys(r).every((k) => ['name', 'endpoints', 'binaries'].includes(k)) &&
      (r.endpoints ?? []).every(isSimpleEndpoint) &&
      (r.binaries ?? []).length > 0
    if (!simple) {
      advanced[name] = r
      continue
    }
    for (const e of r.endpoints ?? []) {
      for (const b of r.binaries ?? []) {
        rows.push({
          rule: name,
          binary: b.path ?? '',
          endpoint: `${e.host}:${e.port}`,
          access: e.access ?? 'NETWORK_ACCESS_PRESET_READ_WRITE',
          l4: e.protocol !== 'rest',
        })
      }
    }
  }
  return { rows, advanced }
}

/** Drops the rules the gateway adds for attached providers. */
export function withoutProviderRules(policy: SandboxPolicy = {}): SandboxPolicy {
  const copy = structuredClone(policy)
  for (const k of Object.keys(copy.network_policies ?? {})) {
    if (isProviderRule(k)) delete copy.network_policies![k]
  }
  return copy
}

const cliEnum = (v: string | undefined, prefix: string) =>
  v ? v.replace(prefix, '').toLowerCase().replace(/_/g, '-') : v

/**
 * Converts a proto-shaped policy into the CLI document shape (as for
 * `openshell policy set`), which reads better and round-trips through
 * /api/convert/policy.
 */
export function toCliDoc(policy: SandboxPolicy = {}): Record<string, unknown> {
  const doc: Record<string, unknown> = structuredClone(policy) as Record<string, unknown>
  if (doc.filesystem) {
    doc.filesystem_policy = doc.filesystem
    delete doc.filesystem
  }
  for (const r of Object.values(
    (doc.network_policies ?? {}) as Record<string, NetworkPolicyRule>,
  )) {
    for (const e of (r.endpoints ?? []) as Record<string, unknown>[]) {
      e.access = cliEnum(e.access as string, 'NETWORK_ACCESS_PRESET_')
      e.enforcement = cliEnum(e.enforcement as string, 'NETWORK_ENFORCEMENT_MODE_')
      e.tls = cliEnum(e.tls as string, 'NETWORK_TLS_MODE_')
      for (const k of ['access', 'enforcement', 'tls']) if (e[k] === undefined) delete e[k]
      const ports = e.ports as number[] | undefined
      if (ports?.length === 1 && ports[0] === e.port) delete e.ports
    }
  }
  const order = ['version', 'filesystem_policy', 'landlock', 'process', 'network_policies']
  const rank = (k: string) => order.indexOf(k) + 1 || 99
  return Object.fromEntries(
    Object.keys(doc)
      .sort((a, b) => rank(a) - rank(b))
      .map((k) => [k, doc[k]]),
  )
}

/** The policy as CLI YAML. */
export const policyToYaml = (policy?: SandboxPolicy) =>
  stringify(toCliDoc(policy), { lineWidth: 0, aliasDuplicateObjects: false })
