import { useHealth } from '@/api/queries'
import { StatusBadge } from '@/components/common/status-badge'
import { useCanWrite, useScope } from '@/hooks/use-scope'
import { enumLabel } from '@/lib/format'
import { useSession } from '@/api/queries'

/** Health of the selected gateway and the WebUI's write mode. */
export function GatewayStatus() {
  const { gw } = useScope()
  const health = useHealth(gw)
  const session = useSession()
  const canWrite = useCanWrite()

  let badge
  if (!gw) badge = <StatusBadge tone="danger">No gateway</StatusBadge>
  else if (health.isPending)
    badge = (
      <StatusBadge tone="neutral" pulse>
        Checking
      </StatusBadge>
    )
  else if (health.isError)
    badge = (
      <StatusBadge tone="danger" title={health.error.message}>
        Unreachable
      </StatusBadge>
    )
  else {
    const status = enumLabel(health.data?.status, 'SERVICE_STATUS_')
    badge = (
      <StatusBadge tone={status === 'Healthy' ? 'success' : 'warning'}>
        {status} · v{health.data?.version}
      </StatusBadge>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {badge}
      {session.data && (
        <StatusBadge
          dot={false}
          tone={canWrite ? 'warning' : 'neutral'}
          title={
            canWrite
              ? 'Actions change the gateway; they are recorded in the audit log.'
              : 'Started with --read-only; every change is refused.'
          }
          className="hidden sm:inline-flex"
        >
          {canWrite ? 'Read-write' : 'Read-only'}
        </StatusBadge>
      )}
    </div>
  )
}
