/**
 * Turns a proto enum value into a label: enumLabel("SANDBOX_PHASE_READY",
 * "SANDBOX_PHASE_") is "Ready".
 */
export function enumLabel(value: string | undefined | null, prefix: string | RegExp = ''): string {
  if (!value) return ''
  const s = String(value).replace(prefix, '').toLowerCase().replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function toDate(iso?: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDateTime(iso?: string | null): string {
  const d = toDate(iso)
  return d ? d.toLocaleString() : ''
}

/** HH:MM:SS.mmm in local time, for log lines. */
export function formatClock(iso?: string | null): string {
  const d = toDate(iso)
  if (!d) return ''
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/** "3 minutes ago", "in 2 hours". */
export function formatRelative(iso?: string | null, now: number = Date.now()): string {
  const d = toDate(iso)
  if (!d) return ''
  const diff = (d.getTime() - now) / 1000
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs || unit === 'second') {
      return rtf.format(Math.round(diff / secs), unit)
    }
  }
  return ''
}

export function shortHash(hash?: string, n = 12): string {
  return hash ? hash.slice(0, n) : ''
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Shortens a long identifier in the middle: "openshell-def…upervisor". */
export function middleTruncate(s: string, max: number): string {
  if (s.length <= max) return s
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  return `${s.slice(0, head)}…${s.slice(s.length - (keep - head))}`
}

/**
 * A container image reference shortened to what tells images apart: the last
 * path segment and the tag or digest, e.g. `hello-sandbox-dev:sha-a8b083562a62`
 * for `europe-west3-docker.pkg.dev/org/repo/hello-sandbox-dev:sha-a8b083562a62`.
 * When that is still too long, the name is cut and the tag kept whole.
 */
export function shortImage(ref: string, max = 32): string {
  const at = ref.indexOf('@')
  const path = at < 0 ? ref : ref.slice(0, at)
  const segment = path.slice(path.lastIndexOf('/') + 1)
  const colon = segment.lastIndexOf(':')
  const name = colon < 0 ? segment : segment.slice(0, colon)
  // A digest is unique within a dozen characters.
  const digest = at < 0 ? '' : ref.slice(at, ref.indexOf(':', at) + 13)
  const suffix = digest || (colon < 0 ? '' : segment.slice(colon))
  if (name.length + suffix.length <= max) return name + suffix
  if (suffix.length > max - 8) return middleTruncate(name + suffix, max)
  return middleTruncate(name, max - suffix.length) + suffix
}
