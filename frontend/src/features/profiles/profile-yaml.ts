import { stringify } from 'yaml'

import type { ProviderProfile } from '@/gen/openshell'

/** A stored profile as editable YAML, without the fields the server sets. */
export function profileToYaml(p: ProviderProfile): string {
  const { source: _s, scope: _sc, resource_version: _rv, ...rest } = p
  return stringify(rest, { lineWidth: 0 })
}
