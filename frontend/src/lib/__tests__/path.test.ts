import { describe, expect, it } from 'vitest'

import { formatBytes, joinPath, normalizePath, parentPath, pathSegments } from '../path'

describe('path helpers', () => {
  it('normalizes', () => {
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('/a//b/./c/')).toBe('/a/b/c')
    expect(normalizePath('/a/b/../c')).toBe('/a/c')
    expect(normalizePath('/../..')).toBe('/')
  })
  it('joins and walks up', () => {
    expect(joinPath('/sandbox', 'x.txt')).toBe('/sandbox/x.txt')
    expect(joinPath('/', 'tmp')).toBe('/tmp')
    expect(parentPath('/sandbox/src')).toBe('/sandbox')
    expect(parentPath('/')).toBe('/')
  })
  it('splits into breadcrumb segments', () => {
    expect(pathSegments('/sandbox/src')).toEqual([
      { name: '/', path: '/' },
      { name: 'sandbox', path: '/sandbox' },
      { name: 'src', path: '/sandbox/src' },
    ])
  })
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(64 * 1024 * 1024)).toBe('64 MB')
  })
})
