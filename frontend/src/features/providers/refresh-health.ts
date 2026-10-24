import type { Tone } from '@/components/common/status-badge'
import type { ProviderCredentialRefreshStatus } from '@/gen/openshell'

export interface RefreshHealth {
  tone: Tone
  label: string
  /** Higher is worse; a provider shows its worst credential. */
  rank: number
}

// Status strings the gateway sets (openshell-server provider_refresh.rs).
const BY_STATUS: Record<string, RefreshHealth> = {
  refreshed: { tone: 'success', label: 'Refreshed', rank: 0 },
  configured: { tone: 'neutral', label: 'Configured', rank: 1 },
  refresh_in_progress: { tone: 'info', label: 'Refreshing', rank: 1 },
  refresh_committing: { tone: 'info', label: 'Refreshing', rank: 1 },
  deleting: { tone: 'neutral', label: 'Deleting', rank: 1 },
  error: { tone: 'warning', label: 'Failing, retrying', rank: 3 },
  configuration_required: { tone: 'danger', label: 'Needs configuration', rank: 4 },
  investigation_required: { tone: 'danger', label: 'Failing', rank: 4 },
  reauthorization_required: { tone: 'danger', label: 'Needs reauthorization', rank: 5 },
}

/** How one credential's automatic refresh is doing. */
export function refreshHealth(c: ProviderCredentialRefreshStatus, now = Date.now()): RefreshHealth {
  const known = BY_STATUS[c.status ?? '']
  if (known && known.rank >= 3) return known
  if (c.expiration_time && Date.parse(c.expiration_time) <= now)
    return { tone: 'danger', label: 'Expired', rank: 4 }
  if (known) return known
  return c.last_error
    ? { tone: 'warning', label: c.status || 'Failing', rank: 3 }
    : { tone: 'neutral', label: c.status || 'Unknown', rank: 2 }
}

/** The worst health over a provider's refreshed credentials; null when none is refreshed. */
export function providerRefreshHealth(
  credentials: ProviderCredentialRefreshStatus[],
  now = Date.now(),
): RefreshHealth | null {
  return credentials
    .map((c) => refreshHealth(c, now))
    .reduce<RefreshHealth | null>((worst, h) => (!worst || h.rank > worst.rank ? h : worst), null)
}
