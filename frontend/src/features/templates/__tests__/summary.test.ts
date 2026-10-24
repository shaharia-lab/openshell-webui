import { describe, expect, it } from 'vitest'

import { parseDriverConfig, templateSummary } from '../summary'

describe('templateSummary', () => {
  it('lists image, resources and environment keys', () => {
    expect(
      templateSummary({
        spec: {
          workload: {
            image: 'agent:dev',
            resources: { cpu: '2', gpu: {} },
            environment: { A: '1', B: '2' },
          },
        },
      }),
    ).toBe('agent:dev · cpu 2, gpu default · env A, B')
  })

  it("falls back to the gateway's default image", () => {
    expect(templateSummary({ spec: { workload: {} } })).toBe("gateway's default image")
  })
})

describe('parseDriverConfig', () => {
  it('accepts empty input and JSON objects', () => {
    expect(parseDriverConfig('  ')).toBeUndefined()
    expect(parseDriverConfig('{"kubernetes": {"pod": {}}}')).toEqual({ kubernetes: { pod: {} } })
  })

  it('rejects invalid JSON and non-objects', () => {
    expect(() => parseDriverConfig('{')).toThrow(SyntaxError)
    expect(() => parseDriverConfig('[1]')).toThrow('JSON object')
    expect(() => parseDriverConfig('null')).toThrow('JSON object')
  })
})
