import { describe, expect, it } from 'vitest'

import { isIgnored, parseGitignore } from '../gitignore'

describe('gitignore', () => {
  const rules = parseGitignore(
    [
      '# comment',
      '*.log',
      '!keep.log',
      'build/',
      '/root-only.txt',
      'docs/**/*.tmp',
      'cache?',
      '[ab].bin',
      '\\#hash',
    ].join('\n'),
  )
  const ignored = (p: string, dir = false) => isIgnored(rules, p, dir)

  it('matches names at any depth', () => {
    expect(ignored('app.log')).toBe(true)
    expect(ignored('src/deep/app.log')).toBe(true)
    expect(ignored('src/app.ts')).toBe(false)
  })
  it('negates', () => expect(ignored('src/keep.log')).toBe(false))
  it('treats a trailing slash as folders only', () => {
    expect(ignored('build', true)).toBe(true)
    expect(ignored('a/build/out.js')).toBe(true)
    expect(ignored('build')).toBe(false)
  })
  it('anchors patterns with a slash', () => {
    expect(ignored('root-only.txt')).toBe(true)
    expect(ignored('sub/root-only.txt')).toBe(false)
  })
  it('supports **, ? and classes', () => {
    expect(ignored('docs/x.tmp')).toBe(true)
    expect(ignored('docs/a/b/x.tmp')).toBe(true)
    expect(ignored('other/x.tmp')).toBe(false)
    expect(ignored('cache1')).toBe(true)
    expect(ignored('cache12')).toBe(false)
    expect(ignored('a.bin')).toBe(true)
    expect(ignored('c.bin')).toBe(false)
    expect(ignored('#hash')).toBe(true)
  })
  it('cannot re-include a file inside an ignored folder', () => {
    const r = parseGitignore('out/\n!out/keep.txt')
    expect(isIgnored(r, 'out/keep.txt')).toBe(true)
  })
  it('scopes a nested file to its folder', () => {
    const r = parseGitignore('*.gen.ts\n/local.txt', 'proj/web')
    expect(isIgnored(r, 'proj/web/a.gen.ts')).toBe(true)
    expect(isIgnored(r, 'proj/web/local.txt')).toBe(true)
    expect(isIgnored(r, 'proj/a.gen.ts')).toBe(false)
    expect(isIgnored(r, 'proj/web/sub/local.txt')).toBe(false)
  })
})
