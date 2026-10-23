import { describe, expect, it } from 'vitest'

import { shellSplit } from '../shell'

describe('shellSplit', () => {
  it('splits on whitespace and honours quotes', () => {
    expect(shellSplit(`python -c 'print("hi there")'  "a b" ''`)).toEqual([
      'python',
      '-c',
      'print("hi there")',
      'a b',
      '',
    ])
  })
  it('rejects an unclosed quote', () => {
    expect(() => shellSplit('echo "x')).toThrow(/unclosed/)
  })
})
