import { LayersIcon } from 'lucide-react'

import { useWorkspaces } from '@/api/queries'
import { ALL_WORKSPACES } from '@/api/types'
import { SimpleSelect } from '@/components/common/simple-select'
import { useScope } from '@/hooks/use-scope'
import { usePreferences } from '@/lib/preferences'

export function WorkspaceSelect() {
  const { gw, ws } = useScope()
  const setWorkspace = usePreferences((s) => s.setWorkspace)
  const workspaces = useWorkspaces(gw)
  const names = (workspaces.data?.workspaces ?? [])
    .map((w) => w.metadata?.name ?? '')
    .filter(Boolean)
  // Keep the current value selectable while the list loads or if it vanished.
  if (ws !== ALL_WORKSPACES && !names.includes(ws)) names.unshift(ws)

  return (
    <div className="flex items-center gap-1.5">
      <LayersIcon className="size-4 text-muted-foreground" aria-hidden />
      <SimpleSelect
        aria-label="Workspace"
        size="sm"
        className="min-w-36"
        value={ws}
        onValueChange={setWorkspace}
        options={[
          ...names.map((n) => ({ value: n, label: n })),
          { value: ALL_WORKSPACES, label: 'All workspaces' },
        ]}
      />
    </div>
  )
}
