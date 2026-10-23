/**
 * Splits a command line into arguments with shell-style quoting
 * ('single', "double"), without expansion. Throws on an unclosed quote.
 */
export function shellSplit(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  let started = false
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/\s/.test(ch)) {
      if (cur || started) out.push(cur)
      cur = ''
      started = false
    } else {
      cur += ch
    }
  }
  if (quote) throw new Error('The command has an unclosed quote.')
  if (cur || started) out.push(cur)
  return out
}
