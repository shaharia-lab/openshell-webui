import { describe, expect, it } from 'vitest'

import { OSC52_MAX_BYTES, parseOsc52 } from '../osc52'

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))

describe('parseOsc52', () => {
  it('decodes a clipboard write, including UTF-8', () => {
    expect(parseOsc52(`c;${b64('hello')}`)).toBe('hello')
    expect(parseOsc52(`;${b64('naïve → ✓')}`)).toBe('naïve → ✓')
    expect(parseOsc52(`pc;${b64('a\nb')}`)).toBe('a\nb')
  })

  it('refuses clipboard reads, so the sandbox cannot read the user clipboard', () => {
    expect(parseOsc52('c;?')).toBeNull()
  })

  it('ignores clears, malformed and oversized payloads', () => {
    expect(parseOsc52('c;')).toBeNull()
    expect(parseOsc52('c')).toBeNull()
    expect(parseOsc52('c;not base64!')).toBeNull()
    expect(parseOsc52(`c;${btoa('\xff\xfe')}`)).toBeNull()
    expect(parseOsc52(`c;${'A'.repeat(((OSC52_MAX_BYTES + 8) * 4) / 3)}`)).toBeNull()
  })
})
