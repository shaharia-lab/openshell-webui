import { describe, expect, it } from 'vitest'

import {
  filesystemForm,
  formPolicy,
  identityError,
  initialPolicyBuilder,
  pathsError,
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
})
