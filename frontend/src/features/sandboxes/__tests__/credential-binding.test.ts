import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/errors'
import { boundProviders, unattachedBindingProvider } from '../create/credential-binding'

describe('unattachedBindingProvider', () => {
  it('reads the provider from the gateway refusal', () => {
    const err = new ApiError(
      "credential_binding references provider 'gcp-sandbox', but that provider is not attached to the sandbox",
      412,
      'FailedPrecondition',
    )
    expect(unattachedBindingProvider(err)).toBe('gcp-sandbox')
  })

  it('ignores other errors', () => {
    expect(unattachedBindingProvider(new Error('sandbox already exists'))).toBeNull()
    expect(unattachedBindingProvider(null)).toBeNull()
  })
})

describe('boundProviders', () => {
  it('lists each bound provider once', () => {
    expect(
      boundProviders([
        {
          name: 'a',
          endpoints: [
            { host: 'x', port: 443, credential_binding: { provider: 'gcp' } },
            { host: 'y', port: 443 },
          ],
        },
        {
          name: 'b',
          endpoints: [{ host: 'z', port: 443, credential_binding: { provider: 'gcp' } }],
        },
        { name: 'c' },
      ]),
    ).toEqual(['gcp'])
  })
})
