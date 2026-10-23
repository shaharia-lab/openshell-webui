/** POSIX path helpers for sandbox file paths (always absolute). */

export function normalizePath(p: string): string {
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/')
}

export const joinPath = (dir: string, name: string) => normalizePath(`${dir}/${name}`)

export const parentPath = (p: string) => normalizePath(`${p}/..`)

/** Breadcrumb segments: [{name: '/', path: '/'}, {name: 'sandbox', path: '/sandbox'}, …]. */
export function pathSegments(p: string): { name: string; path: string }[] {
  const out = [{ name: '/', path: '/' }]
  let acc = ''
  for (const seg of normalizePath(p).split('/').filter(Boolean)) {
    acc += `/${seg}`
    out.push({ name: seg, path: acc })
  }
  return out
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(n: number): string {
  let i = 0
  let v = n
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 ? v : v.toFixed(v < 10 ? 1 : 0)} ${UNITS[i]}`
}
