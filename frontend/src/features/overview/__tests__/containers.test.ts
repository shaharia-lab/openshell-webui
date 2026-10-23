import { describe, expect, it } from 'vitest'

import { workspaceOf } from '../containers'
import type { Container } from '@/api/types'

const container = (extra: Partial<Container>): Container => ({
  id: '1',
  name: 'openshell-team-a--web-aa27aa8c-supervisor',
  image: 'x',
  state: 'running',
  status: 'Up',
  sandbox: 'web',
  role: 'supervisor',
  ...extra,
})

describe('workspaceOf', () => {
  it('prefers the workspace the backend reports', () => {
    expect(workspaceOf(container({ workspace: 'prod' }))).toBe('prod')
  })
  it('falls back to the container name, then to default', () => {
    expect(workspaceOf(container({}))).toBe('team-a')
    expect(workspaceOf(container({ name: 'something-else' }))).toBe('default')
  })
})
