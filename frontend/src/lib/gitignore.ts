/**
 * A small `.gitignore` matcher: comments, `!` negation, `/` anchoring,
 * trailing-`/` directory rules, `*`, `?`, `**` and `[...]` classes. Each file
 * applies to its own folder and below; a later rule wins, and nothing inside
 * an ignored folder can be re-included, as in git.
 */

interface Rule {
  /** Folder of the `.gitignore`, relative and without slashes at the ends ('' = root). */
  base: string
  re: RegExp
  negate: boolean
  dirOnly: boolean
}

function globToRegex(glob: string): string {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atStart = i === 0 || glob[i - 1] === '/'
        const atEnd = i + 2 === glob.length || glob[i + 2] === '/'
        if (atStart && atEnd) {
          // "**/" matches zero or more folders; a trailing "**" matches everything below.
          if (i + 2 === glob.length) out += '.*'
          else out += '(?:.*/)?'
          i += 2
          continue
        }
        i++
      }
      out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else if (c === '[') {
      const end = glob.indexOf(']', i + 2)
      if (end === -1) out += '\\['
      else {
        let cls = glob.slice(i + 1, end).replace(/\\/g, '\\\\')
        if (cls[0] === '!') cls = '^' + cls.slice(1)
        out += `[${cls}]`
        i = end
      }
    } else if (c === '\\' && i + 1 < glob.length) {
      out += glob[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    } else out += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  }
  return out
}

/** Parses the text of one `.gitignore` found in folder `base`. */
export function parseGitignore(text: string, base = ''): Rule[] {
  const rules: Rule[] = []
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/(?<!\\)\s+$/, '')
    if (!line || line.startsWith('#')) continue
    const negate = line.startsWith('!')
    if (negate) line = line.slice(1)
    else if (line.startsWith('\\!') || line.startsWith('\\#')) line = line.slice(1)
    const dirOnly = line.endsWith('/')
    if (dirOnly) line = line.slice(0, -1)
    if (!line) continue
    const anchored = line.includes('/')
    if (line.startsWith('/')) line = line.slice(1)
    const body = globToRegex(line)
    rules.push({
      base: base.replace(/^\/+|\/+$/g, ''),
      re: new RegExp(anchored ? `^${body}$` : `^(?:.*/)?${body}$`),
      negate,
      dirOnly,
    })
  }
  return rules
}

/** Last matching rule wins; `undefined` when no rule matches. */
function decide(rules: Rule[], path: string, isDir: boolean): boolean | undefined {
  let result: boolean | undefined
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue
    let rel = path
    if (r.base) {
      if (!path.startsWith(r.base + '/')) continue
      rel = path.slice(r.base.length + 1)
    }
    if (r.re.test(rel)) result = !r.negate
  }
  return result
}

/**
 * Whether a relative path is ignored, given the rules of every `.gitignore`
 * collected so far. Each parent folder is checked first.
 */
export function isIgnored(rules: Rule[], path: string, isDir = false): boolean {
  const segs = path.split('/').filter(Boolean)
  for (let i = 1; i <= segs.length; i++) {
    const last = i === segs.length
    if (decide(rules, segs.slice(0, i).join('/'), last ? isDir : true)) return true
  }
  return false
}

export type { Rule as GitignoreRule }
