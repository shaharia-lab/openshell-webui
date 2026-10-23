import { z } from 'zod'

/** Resource names: the backend's rule for sandbox, provider, service and workspace names. */
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .regex(
    NAME_RE,
    "Start with a letter or digit; use only letters, digits, '.', '_' or '-' (max 63).",
  )

/** Workspace names must be DNS-1123 labels. */
export const workspaceNameSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/,
    'Use lowercase letters, digits and "-" (a DNS label, max 63).',
  )

export const cpuSchema = z
  .string()
  .trim()
  .regex(/^(\d+(\.\d+)?m?)?$/, 'Use a CPU quantity such as 500m, 1 or 2.5.')
export const memorySchema = z
  .string()
  .trim()
  .regex(
    /^(\d+(\.\d+)?(Ki|Mi|Gi|Ti|K|M|G|T)?)?$/,
    'Use a memory quantity such as 512Mi, 4Gi or 8G.',
  )

export const portSchema = z.coerce
  .number({ error: 'Enter a port.' })
  .int('Use a whole number.')
  .min(1, 'Ports are 1 to 65535.')
  .max(65535, 'Ports are 1 to 65535.')

export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
export const CONFIG_KEY_RE = /^[A-Za-z0-9_.-]+$/

export interface KeyValue {
  key: string
  value: string
}

/** Validates key/value rows: keys follow `keyRe`, are unique, and values need a key. */
export function keyValueRowsSchema(keyRe: RegExp, rule: string) {
  return z.array(z.object({ key: z.string(), value: z.string() })).superRefine((rows, ctx) => {
    const seen = new Set<string>()
    rows.forEach((r, i) => {
      const k = r.key.trim()
      let msg = ''
      if (!k && r.value) msg = 'Enter a key for this value.'
      else if (k && !keyRe.test(k)) msg = `${k} ${rule}.`
      else if (k && seen.has(k)) msg = `${k} is used twice.`
      if (k) seen.add(k)
      if (msg) ctx.addIssue({ code: 'custom', message: msg, path: [i, 'key'] })
    })
  })
}

export const envRowsSchema = keyValueRowsSchema(
  ENV_KEY_RE,
  "must start with a letter or '_' and use only letters, digits and '_'",
)
export const configRowsSchema = keyValueRowsSchema(
  CONFIG_KEY_RE,
  "may use only letters, digits, '.', '_' and '-'",
)

/** Key/value rows to a map, skipping blank keys. */
export function rowsToMap(rows: KeyValue[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) if (r.key.trim()) out[r.key.trim()] = r.value
  return out
}

export const mapToRows = (m: Record<string, string> = {}): KeyValue[] =>
  Object.entries(m).map(([key, value]) => ({ key, value }))

/** Kubernetes-style label keys: an optional DNS prefix and a name. */
export const LABEL_KEY_RE =
  /^([a-z0-9]([-a-z0-9.]*[a-z0-9])?\/)?[A-Za-z0-9]([A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?$/
export const labelRowsSchema = keyValueRowsSchema(
  LABEL_KEY_RE,
  "is not a valid label key (letters, digits, '-', '_', '.', optional prefix/)",
)
