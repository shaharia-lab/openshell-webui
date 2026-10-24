import { describe, expect, it } from 'vitest'

import { createSandboxRequest, type CreateSandboxInput } from '../create/request'

const input = (over: Partial<CreateSandboxInput> = {}): CreateSandboxInput => ({
  name: 'agent-1',
  image: 'ubuntu:24.04',
  template: '',
  restart: '',
  command: 'claude --verbose',
  cpu: '2',
  memory: '4Gi',
  gpu: true,
  gpuCount: '',
  providers: ['github'],
  env: [{ key: 'FOO', value: 'bar' }],
  labels: [{ key: 'team', value: 'ai' }],
  services: [],
  ...over,
})

describe('createSandboxRequest', () => {
  it('sends the inline workload without a template', () => {
    const body = createSandboxRequest(input())
    expect(body.workload_template).toBeUndefined()
    expect(body.spec).toEqual({
      tty: true,
      template: { image: 'ubuntu:24.04', resources: { limits: { cpu: '2', memory: '4Gi' } } },
      environment: { FOO: 'bar' },
      resource_requirements: { gpu: {} },
      command: ['claude', '--verbose'],
      providers: ['github'],
    })
  })

  it('leaves the workload to the template, keeping per-sandbox fields', () => {
    const body = createSandboxRequest(
      input({ template: 'gpu-kata', restart: 'SANDBOX_RESTART_POLICY_ALWAYS' }),
      { version: 1 },
    )
    expect(body.workload_template).toBe('gpu-kata')
    expect(body.spec).toEqual({
      tty: true,
      command: ['claude', '--verbose'],
      providers: ['github'],
      restart_policy: 'SANDBOX_RESTART_POLICY_ALWAYS',
      policy: { version: 1 },
    })
    expect(body.labels).toEqual({ team: 'ai' })
  })
})
