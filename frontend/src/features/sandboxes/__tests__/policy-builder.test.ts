import { describe, expect, it } from 'vitest'

import {
  filesystemForm,
  formPolicy,
  identityError,
  initialPolicyBuilder,
  pathsError,
  stateFromPolicy,
} from '../create/policy-builder'

describe('policy builder', () => {
  it('sends only network rules for the default policy', () => {
    expect(formPolicy(initialPolicyBuilder, [])).toEqual({ network_policies: {} })
  })

  it('adds custom filesystem, landlock and process sections', () => {
    const doc = formPolicy(
      {
        ...initialPolicyBuilder,
        filesystem: { ...filesystemForm(null), readWrite: '/tmp\n\n /work \n' },
        process: { user: 'sandbox', group: '' },
      },
      [],
    )
    expect(doc.filesystem?.read_write).toEqual(['/tmp', '/work'])
    expect(doc.filesystem?.read_only).toContain('/usr')
    expect(doc.filesystem?.include_workdir).toBe(true)
    expect(doc.landlock).toEqual({ compatibility: 'best_effort' })
    expect(doc.process).toEqual({ run_as_user: 'sandbox' })
  })

  it('drops an empty process identity, even from a copied policy', () => {
    const base = { process: { run_as_user: '1000', run_as_group: '1000' } }
    const doc = formPolicy(
      { ...initialPolicyBuilder, base, baseName: 'a', process: { user: '', group: '' } },
      [],
    )
    expect(doc.process).toBeUndefined()
  })

  it('starts the filesystem form from the copied policy', () => {
    const f = filesystemForm({
      filesystem: { include_workdir: false, read_only: ['/a'], read_write: [] },
      landlock: { compatibility: 'hard_requirement' },
    })
    expect(f).toEqual({
      includeWorkdir: false,
      readOnly: '/a',
      readWrite: '',
      landlock: 'hard_requirement',
    })
  })

  it('validates paths and identities like the gateway', () => {
    expect(pathsError('/usr\n/tmp')).toBeNull()
    expect(pathsError('usr')).toMatch(/absolute/)
    expect(pathsError('/a/../etc')).toMatch(/\.\./)
    expect(identityError('')).toBeNull()
    expect(identityError('sandbox')).toBeNull()
    expect(identityError('1000')).toBeNull()
    expect(identityError('0')).toMatch(/Root/)
    expect(identityError('root')).toMatch(/numeric/)
  })

  describe('stateFromPolicy', () => {
    const parsed = {
      version: 1,
      filesystem: { include_workdir: true, read_only: ['/usr'], read_write: ['/tmp'] },
      landlock: { compatibility: 'best_effort' },
      network_policies: {
        claude: {
          name: 'claude',
          binaries: [{ path: '/usr/local/bin/claude' }],
          endpoints: [{ host: 'platform.claude.com', port: 443 }],
        },
        pypi: {
          name: 'pypi',
          binaries: [{ path: '/usr/local/bin/uv' }],
          endpoints: [{ host: 'pypi.org', port: 443, protocol: 'rest', rules: [] }],
        },
        _provider_x: { name: '_provider_x' },
      },
    }

    it('puts a loaded policy into the form and sends it back unchanged', () => {
      const { state, rows } = stateFromPolicy(initialPolicyBuilder, parsed)
      expect(state.yaml).toBeNull()
      expect(rows.map((r) => r.endpoint)).toEqual(['platform.claude.com:443'])
      expect(Object.keys(state.advanced)).toEqual(['pypi'])
      expect(state.filesystem?.readOnly).toBe('/usr')
      expect(state.process).toBeNull()
      const doc = formPolicy(state, rows)
      expect(doc.filesystem).toEqual(parsed.filesystem)
      expect(Object.keys(doc.network_policies ?? {}).sort()).toEqual(['claude', 'pypi'])
    })

    it('keeps network-only YAML on the gateway default', () => {
      const { state } = stateFromPolicy(initialPolicyBuilder, {
        network_policies: parsed.network_policies,
      })
      expect(state.filesystem).toBeNull()
      expect(state.base).toBeNull()
    })

    it('replaces a copied base with the edited policy', () => {
      const { state } = stateFromPolicy(
        { ...initialPolicyBuilder, base: {}, baseName: 'a', yaml: '' },
        parsed,
      )
      expect(state.baseName).toBe('a')
      expect(state.base?.filesystem).toEqual(parsed.filesystem)
      expect(state.base?.network_policies?._provider_x).toBeUndefined()
      expect(state.filesystem).toBeNull()
    })
  })
})
