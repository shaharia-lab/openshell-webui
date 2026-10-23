import { describe, expect, it } from 'vitest'

import {
  buildRules,
  conflictsWithExisting,
  emptyRuleRow,
  policyToYaml,
  ruleRowError,
  splitPolicyRules,
  type RuleRow,
} from '../policy'

const row = (binary: string, endpoint: string, extra: Partial<RuleRow> = {}): RuleRow => ({
  ...emptyRuleRow(),
  binary,
  endpoint,
  ...extra,
})

describe('ruleRowError', () => {
  it('accepts blank and valid rows', () => {
    expect(ruleRowError(emptyRuleRow())).toBeNull()
    expect(ruleRowError(row('/usr/bin/curl', 'api.github.com:443'))).toBeNull()
  })
  it('explains invalid rows', () => {
    expect(ruleRowError(row('', 'a.com:443'))).toMatch(/binary path/)
    expect(ruleRowError(row('curl', 'a.com:443'))).toMatch(/absolute path/)
    expect(ruleRowError(row('/bin/x', 'a.com'))).toMatch(/host:port/)
    expect(ruleRowError(row('/bin/x', 'a.com:70000'))).toMatch(/1 to 65535/)
  })
})

describe('buildRules', () => {
  it('groups binaries that share an endpoint and access level', () => {
    const rules = buildRules([
      row('/usr/bin/curl', 'api.github.com:443'),
      row('/usr/bin/git', 'api.github.com:443'),
    ])
    expect(rules).toHaveLength(1)
    expect(rules[0].name).toBe('allow_api_github_com_443')
    expect(rules[0].binaries).toEqual([{ path: '/usr/bin/curl' }, { path: '/usr/bin/git' }])
    expect(rules[0].endpoints?.[0]).toMatchObject({
      protocol: 'rest',
      access: 'NETWORK_ACCESS_PRESET_READ_WRITE',
    })
  })

  it('writes L4 endpoints without HTTP inspection fields', () => {
    const [rule] = buildRules([row('/bin/nc', 'db.local:5432', { l4: true })])
    expect(rule.endpoints).toEqual([{ host: 'db.local', port: 5432 }])
  })

  it('avoids taken rule names', () => {
    const [rule] = buildRules([row('/bin/x', 'a.com:443')], ['allow_a_com_443'])
    expect(rule.name).toBe('allow_a_com_443_2')
  })

  it('rebuilds an existing rule when its rows still form every pair', () => {
    const rows = [
      row('/a', 'x.com:443', { rule: 'mine' }),
      row('/a', 'y.com:443', { rule: 'mine' }),
      row('/b', 'x.com:443', { rule: 'mine' }),
      row('/b', 'y.com:443', { rule: 'mine' }),
    ]
    const rules = buildRules(rows)
    expect(rules).toHaveLength(1)
    expect(rules[0].name).toBe('mine')
    expect(rules[0].endpoints).toHaveLength(2)
  })

  it('splits an existing rule when a pair was removed', () => {
    const rows = [
      row('/a', 'x.com:443', { rule: 'mine' }),
      row('/a', 'y.com:443', { rule: 'mine' }),
      row('/b', 'x.com:443', { rule: 'mine' }),
    ]
    const rules = buildRules(rows)
    expect(rules.map((r) => r.name).sort()).toEqual(['allow_x_com_443', 'allow_y_com_443'])
  })

  it('refuses two access levels for one host:port', () => {
    expect(() =>
      buildRules([
        row('/a', 'x.com:443'),
        row('/b', 'x.com:443', { access: 'NETWORK_ACCESS_PRESET_READ_ONLY' }),
      ]),
    ).toThrow(/two access levels/)
  })

  it('throws on invalid rows and skips blank ones', () => {
    expect(buildRules([emptyRuleRow()])).toEqual([])
    expect(() => buildRules([row('nope', 'x.com:443')])).toThrow(/absolute path/)
  })
})

describe('conflictsWithExisting', () => {
  const existing = {
    gh: {
      endpoints: [
        {
          host: 'api.github.com',
          port: 443,
          protocol: 'rest',
          access: 'NETWORK_ACCESS_PRESET_READ_ONLY' as const,
        },
      ],
    },
    _provider_x: { endpoints: [{ host: 'p.com', port: 443 }] },
  }
  it('flags a different access level for an existing host:port', () => {
    const rules = buildRules([row('/a', 'api.github.com:443')])
    expect(conflictsWithExisting(rules, existing)).toMatch(/already has rule gh with read-only/)
  })
  it('ignores provider rules and matching levels', () => {
    expect(conflictsWithExisting(buildRules([row('/a', 'p.com:443')]), existing)).toBeNull()
    const same = buildRules([
      row('/a', 'api.github.com:443', { access: 'NETWORK_ACCESS_PRESET_READ_ONLY' }),
    ])
    expect(conflictsWithExisting(same, existing)).toBeNull()
  })
})

describe('splitPolicyRules', () => {
  it('turns simple rules into rows and keeps advanced ones', () => {
    const { rows, advanced } = splitPolicyRules({
      network_policies: {
        simple: {
          name: 'simple',
          endpoints: [
            {
              host: 'a.com',
              port: 443,
              protocol: 'rest',
              access: 'NETWORK_ACCESS_PRESET_FULL',
              enforcement: 'NETWORK_ENFORCEMENT_MODE_ENFORCE',
            },
          ],
          binaries: [{ path: '/a' }, { path: '/b' }],
        },
        l7: {
          endpoints: [{ host: 'b.com', port: 443, protocol: 'rest', rules: [{}] }],
          binaries: [{ path: '/a' }],
        },
        _provider_claude: { endpoints: [{ host: 'c.com', port: 443 }], binaries: [{ path: '/c' }] },
      },
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      rule: 'simple',
      endpoint: 'a.com:443',
      access: 'NETWORK_ACCESS_PRESET_FULL',
      l4: false,
    })
    expect(Object.keys(advanced)).toEqual(['l7'])
  })
})

describe('policyToYaml', () => {
  it('writes the CLI shape', () => {
    const yaml = policyToYaml({
      version: 1,
      filesystem: { read_only: ['/usr'] },
      network_policies: {
        r: {
          endpoints: [
            {
              host: 'a.com',
              port: 443,
              ports: [443],
              protocol: 'rest',
              access: 'NETWORK_ACCESS_PRESET_READ_WRITE',
            },
          ],
        },
      },
    })
    expect(yaml).toContain('filesystem_policy:')
    expect(yaml).toContain('access: read-write')
    expect(yaml).not.toContain('ports:')
    expect(yaml.indexOf('version')).toBeLessThan(yaml.indexOf('filesystem_policy'))
  })
})
