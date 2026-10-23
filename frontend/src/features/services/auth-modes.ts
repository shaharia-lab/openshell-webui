import type { ServiceAuthorizationMode } from '@/gen/openshell'

export const AUTH_MODE_OPTIONS: { value: ServiceAuthorizationMode; label: string }[] = [
  { value: 'SERVICE_AUTHORIZATION_MODE_STRIP', label: 'Strip Authorization header' },
  { value: 'SERVICE_AUTHORIZATION_MODE_BEARER_PASSTHROUGH', label: 'Pass bearer token through' },
]
