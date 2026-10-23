import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { useServices } from '@/api/queries'
import { QueryView } from '@/components/common/query-view'
import { Section } from '@/components/common/page'
import { WriteButton } from '@/components/common/write-button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { ExposeServiceDialog } from '@/features/services/expose-service-dialog'
import { ServiceUrl } from '@/features/services/service-url'
import { useDeleteService } from '@/features/services/use-delete-service'
import { enumLabel } from '@/lib/format'
import type { SandboxRef } from '@/lib/sandbox'

export function ServicesCard({ gw, sandboxRef }: { gw: string; sandboxRef: SandboxRef }) {
  const services = useServices(gw, sandboxRef.workspace)
  const [exposing, setExposing] = useState(false)
  const remove = useDeleteService(gw)

  return (
    <Section
      title="Services"
      description="HTTP ports published through the gateway."
      actions={
        <WriteButton size="sm" variant="outline" onClick={() => setExposing(true)}>
          <PlusIcon /> Expose
        </WriteButton>
      }
    >
      <QueryView query={services}>
        {(data) => {
          const mine = (data.services ?? []).filter((s) => s.endpoint?.sandbox === sandboxRef.name)
          if (!mine.length)
            return <p className="text-sm text-muted-foreground">No exposed services.</p>
          return (
            <ItemGroup className="gap-2">
              {mine.map((s) => (
                <Item key={s.endpoint?.name ?? ''} variant="outline" size="sm">
                  <ItemContent className="min-w-0">
                    <ItemTitle>
                      {s.endpoint?.name || <span className="text-muted-foreground">(unnamed)</span>}
                      <span className="font-normal text-muted-foreground">
                        port {s.endpoint?.target_port}
                      </span>
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none">
                      <ServiceUrl url={s.url} />
                      <span className="block text-xs">
                        {enumLabel(s.endpoint?.authorization_mode, 'SERVICE_AUTHORIZATION_MODE_')}
                      </span>
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <WriteButton
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete service ${s.endpoint?.name}`}
                      onClick={() =>
                        remove(sandboxRef.workspace, sandboxRef.name, s.endpoint?.name ?? '')
                      }
                    >
                      <Trash2Icon />
                    </WriteButton>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )
        }}
      </QueryView>
      <ExposeServiceDialog
        gw={gw}
        open={exposing}
        onOpenChange={setExposing}
        sandbox={sandboxRef}
      />
    </Section>
  )
}
