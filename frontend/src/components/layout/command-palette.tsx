import { useQueryClient } from '@tanstack/react-query'
import {
  BoxIcon,
  CheckIcon,
  LayersIcon,
  MoonIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
  SquareTerminalIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { NAV } from './nav'
import { useSandboxes, useWorkspaces } from '@/api/queries'
import { ALL_WORKSPACES } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
import { CreateSandboxDialog } from '@/features/sandboxes/create-sandbox-dialog'
import { useCanWrite, useScope } from '@/hooks/use-scope'
import { usePreferences } from '@/lib/preferences'
import { isReady, refOf, sandboxHref } from '@/lib/sandbox'
import { useTheme } from '@/lib/theme-context'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** ⌘K / Ctrl+K: jump to pages and sandboxes, and run common actions. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { gw, ws, gateways } = useScope()
  const sandboxes = useSandboxes(gw, ws)
  const workspaces = useWorkspaces(gw)
  const canWrite = useCanWrite()
  const { resolvedTheme, setTheme } = useTheme()
  const setWorkspace = usePreferences((s) => s.setWorkspace)
  const setGateway = usePreferences((s) => s.setGateway)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** Runs an item's action and closes the palette. */
  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  const list = sandboxes.data?.sandboxes ?? []
  const workspaceNames = (workspaces.data?.workspaces ?? [])
    .map((w) => w.metadata?.name ?? '')
    .filter(Boolean)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground sm:w-48 sm:justify-start"
        onClick={() => setOpen(true)}
        aria-label="Search and commands"
      >
        <SearchIcon />
        <span className="hidden sm:inline">Search…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search and commands">
        <Command>
          <CommandInput placeholder="Go to a page or sandbox, or run a command…" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {list.length > 0 && (
              <CommandGroup heading="Sandboxes">
                {list.map((s) => {
                  const ref = refOf(s)
                  return (
                    <CommandItem
                      key={`${ref.workspace}/${ref.name}`}
                      value={`sandbox ${ref.workspace} ${ref.name}`}
                      onSelect={run(() => navigate(sandboxHref(ref)))}
                    >
                      <BoxIcon />
                      {ref.name}
                      <span className="text-xs text-muted-foreground">{ref.workspace}</span>
                    </CommandItem>
                  )
                })}
                {canWrite &&
                  list.filter(isReady).map((s) => {
                    const ref = refOf(s)
                    return (
                      <CommandItem
                        key={`term ${ref.workspace}/${ref.name}`}
                        value={`terminal shell ${ref.workspace} ${ref.name}`}
                        onSelect={run(() => navigate(sandboxHref(ref, 'terminal')))}
                      >
                        <SquareTerminalIcon />
                        Terminal in {ref.name}
                      </CommandItem>
                    )
                  })}
              </CommandGroup>
            )}
            <CommandGroup heading="Pages">
              {NAV.flatMap((g) => g.items).map((item) => (
                <CommandItem
                  key={item.to}
                  value={`page ${item.label}`}
                  onSelect={run(() => navigate(item.to))}
                >
                  <item.icon />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {canWrite && (
                <CommandItem value="new sandbox create" onSelect={run(() => setCreating(true))}>
                  <PlusIcon />
                  New sandbox
                </CommandItem>
              )}
              <CommandItem
                value="toggle theme dark light"
                onSelect={run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}
              >
                <MoonIcon />
                Toggle theme
                <CommandShortcut>
                  {resolvedTheme === 'dark' ? 'to light' : 'to dark'}
                </CommandShortcut>
              </CommandItem>
              <CommandItem value="refresh reload" onSelect={run(() => void qc.invalidateQueries())}>
                <RefreshCwIcon />
                Refresh now
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Workspace">
              {[...workspaceNames, ALL_WORKSPACES].map((name) => (
                <CommandItem
                  key={name}
                  value={`workspace switch ${name === ALL_WORKSPACES ? 'all workspaces' : name}`}
                  onSelect={run(() => setWorkspace(name))}
                >
                  <LayersIcon />
                  {name === ALL_WORKSPACES ? 'All workspaces' : name}
                  {name === ws && <CheckIcon className="ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
            {(gateways.data?.length ?? 0) > 1 && (
              <CommandGroup heading="Gateway">
                {gateways.data!.map((g) => (
                  <CommandItem
                    key={g.name}
                    value={`gateway switch ${g.name}`}
                    onSelect={run(() => setGateway(g.name))}
                  >
                    <ServerIcon />
                    {g.name}
                    {g.name === gw && <CheckIcon className="ml-auto" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>

      <CreateSandboxDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
