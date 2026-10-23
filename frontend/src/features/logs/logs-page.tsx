import { ScrollTextIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { LogViewer } from './log-viewer'
import { useSandboxes } from '@/api/queries'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page'
import { QueryView } from '@/components/common/query-view'
import { SimpleSelect } from '@/components/common/simple-select'
import { Card } from '@/components/ui/card'
import { useScope } from '@/hooks/use-scope'
import { refOf } from '@/lib/sandbox'
import { useDocumentTitle } from '@/hooks/use-document-title'

const key = (r: { workspace: string; name: string }) => `${r.workspace}/${r.name}`

export default function LogsPage() {
  useDocumentTitle('Logs')
  const { gw, ws, allWorkspaces } = useScope()
  const sandboxes = useSandboxes(gw, ws)
  const [params, setParams] = useSearchParams()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs"
        description="Gateway and sandbox log lines, including network decisions."
      />
      <QueryView query={sandboxes}>
        {(data) => {
          const refs = (data.sandboxes ?? []).map(refOf)
          if (!refs.length) {
            return (
              <Card>
                <EmptyState
                  icon={<ScrollTextIcon />}
                  title="No sandboxes"
                  description="Logs appear once a sandbox exists in this workspace."
                />
              </Card>
            )
          }
          const selected = refs.find((r) => key(r) === params.get('sandbox')) ?? refs[0]
          return (
            <LogViewer
              key={key(selected)}
              gw={gw}
              sandboxRef={selected}
              toolbarStart={
                <SimpleSelect
                  size="sm"
                  aria-label="Sandbox"
                  className="min-w-40"
                  value={key(selected)}
                  onValueChange={(v) => setParams({ sandbox: v }, { replace: true })}
                  options={refs.map((r) => ({
                    value: key(r),
                    label: allWorkspaces ? key(r) : r.name,
                  }))}
                />
              }
            />
          )
        }}
      </QueryView>
    </div>
  )
}
