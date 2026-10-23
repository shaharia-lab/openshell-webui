import { describe, expect, it } from 'vitest'

import { envRowsSchema, nameSchema, rowsToMap } from '../validation'

describe('validation', () => {
  it('checks names', () => {
    expect(nameSchema.safeParse('my-box_1.2').success).toBe(true)
    expect(nameSchema.safeParse('-bad').success).toBe(false)
  })
  it('checks env rows for format and duplicates', () => {
    const r = envRowsSchema.safeParse([
      { key: 'OK', value: '1' },
      { key: '1BAD', value: '' },
      { key: 'OK', value: '2' },
      { key: '', value: 'orphan' },
    ])
    expect(r.success).toBe(false)
    const msgs = r.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    expect(msgs).toEqual([
      expect.stringMatching(/^1\.key: 1BAD must start/),
      expect.stringMatching(/^2\.key: OK is used twice/),
      expect.stringMatching(/^3\.key: Enter a key/),
    ])
  })
  it('maps rows to an object', () => {
    expect(
      rowsToMap([
        { key: ' A ', value: 'x' },
        { key: '', value: '' },
      ]),
    ).toEqual({ A: 'x' })
  })
})
