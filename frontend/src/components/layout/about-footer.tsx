import { ArrowUpCircleIcon } from 'lucide-react'

import { useAbout } from '@/api/queries'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

const REPOSITORY = 'https://github.com/shaharia-lab/openshell-webui'

/** The repository link, the WebUI and OpenShell CLI versions, and a notice when a newer release exists. */
export function AboutFooter() {
  const about = useAbout()
  const repo = about.data?.repository || REPOSITORY
  const versions = [
    about.data && `WebUI v${about.data.version}`,
    about.data &&
      (about.data.openshell_cli_version
        ? `OpenShell v${about.data.openshell_cli_version}`
        : 'OpenShell CLI not found'),
  ]
    .filter(Boolean)
    .join(' · ')
  const latest = about.data?.update_available ? about.data.latest_release : undefined

  return (
    <SidebarMenu>
      {latest && (
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip={`Update available: v${latest.version}`}
            render={<a href={latest.url} target="_blank" rel="noopener noreferrer" />}
            className="text-amber-700 dark:text-amber-400"
          >
            <ArrowUpCircleIcon />
            <div className="grid flex-1 text-left text-xs leading-tight">
              <span className="truncate text-sm font-medium">Update available</span>
              <span className="truncate">
                v{latest.version} is out · you have v{about.data?.version}
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={
            versions ? `shaharia-lab/openshell-webui · ${versions}` : 'shaharia-lab/openshell-webui'
          }
          render={<a href={repo} target="_blank" rel="noopener noreferrer" />}
          className="h-auto py-1.5 text-muted-foreground"
        >
          <GitHubIcon />
          <div className="grid flex-1 text-left text-xs leading-tight">
            <span className="truncate">shaharia-lab/openshell-webui</span>
            {versions && <span className="truncate text-[11px]">{versions}</span>}
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** lucide-react has no brand icons; this is GitHub's mark. */
function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
