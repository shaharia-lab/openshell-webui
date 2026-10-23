import { EllipsisIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { NetworkEndpoint, NetworkPolicyRule } from '@/gen/sandbox'
import { useCanWrite } from '@/hooks/use-scope'
import { enumLabel } from '@/lib/format'
import { endpointMode, isProviderRule } from '@/lib/policy'

export interface RuleActions {
  removeRule: (rule: string) => void
  removeEndpoint: (rule: string, e: NetworkEndpoint) => void
  removeBinary: (rule: string, path: string) => void
}

/** Extra endpoint options worth a glance, beyond host, port and access. */
function endpointNotes(e: NetworkEndpoint): string[] {
  const notes: string[] = []
  if (e.path) notes.push(`path ${e.path}`)
  if (e.rules?.length) notes.push(`${e.rules.length} L7 allow rule${e.rules.length > 1 ? 's' : ''}`)
  if (e.deny_rules?.length)
    notes.push(`${e.deny_rules.length} deny rule${e.deny_rules.length > 1 ? 's' : ''}`)
  if (e.tls && e.tls !== 'NETWORK_TLS_MODE_UNSPECIFIED')
    notes.push(`TLS ${enumLabel(e.tls, 'NETWORK_TLS_MODE_').toLowerCase()}`)
  if (e.enforcement === 'NETWORK_ENFORCEMENT_MODE_AUDIT') notes.push('audit only')
  if (e.allowed_ips?.length) notes.push(`IPs ${e.allowed_ips.join(', ')}`)
  if (e.mcp) notes.push('MCP')
  if (e.credential_binding?.provider)
    notes.push(`credentials from ${e.credential_binding.provider}`)
  return notes
}

const modeTone: Record<string, string> = {
  'read-only': 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  'read-write': 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  full: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
  L4: 'border-border bg-muted text-muted-foreground',
}

interface NetworkRulesTableProps {
  rules: Record<string, NetworkPolicyRule>
  actions: RuleActions
}

/** The network rules of a policy: who may reach what, with per-part removal. */
export function NetworkRulesTable({ rules, actions }: NetworkRulesTableProps) {
  const canWrite = useCanWrite()
  const entries = Object.entries(rules).sort(
    ([a], [b]) => Number(isProviderRule(a)) - Number(isProviderRule(b)) || a.localeCompare(b),
  )
  if (!entries.length) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No network rules: all egress is denied.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 text-xs text-muted-foreground">Rule</TableHead>
            <TableHead className="px-4 text-xs text-muted-foreground">Endpoints</TableHead>
            <TableHead className="px-4 text-xs text-muted-foreground">Binaries</TableHead>
            <TableHead className="w-10 px-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([name, rule]) => {
            const managed = isProviderRule(name)
            const editable = canWrite && !managed
            const endpoints = rule.endpoints ?? []
            const binaries = rule.binaries ?? []
            return (
              <TableRow key={name} className="align-top">
                <TableCell className="min-w-40 px-4 align-top font-medium whitespace-normal">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="break-words">{name}</span>
                    {managed && (
                      <Badge variant="secondary" className="font-normal">
                        provider
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-4 align-top">
                  <ul className="space-y-1">
                    {endpoints.map((e, i) => {
                      const mode = endpointMode(e)
                      const notes = endpointNotes(e)
                      return (
                        <li key={i} className="group flex flex-wrap items-center gap-1.5">
                          <code className="font-mono text-xs">
                            {e.host}:{(e.ports?.length ? e.ports : [e.port]).join(',')}
                          </code>
                          <Badge variant="outline" className={modeTone[mode] ?? modeTone.L4}>
                            {mode}
                          </Badge>
                          {notes.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {notes.join(' · ')}
                            </span>
                          )}
                          {editable && endpoints.length > 1 && (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                              aria-label={`Remove ${e.host}:${e.port} from ${name}`}
                              onClick={() => actions.removeEndpoint(name, e)}
                            >
                              <XIcon />
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </TableCell>
                <TableCell className="px-4 align-top whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    {binaries.length ? (
                      binaries.map((b) => (
                        <code
                          key={b.path}
                          className="group inline-flex items-center gap-0.5 rounded-md border bg-muted/60 py-0.5 pr-0.5 pl-1.5 font-mono text-[11px] leading-4"
                        >
                          {b.path}
                          {editable && binaries.length > 1 && (
                            <button
                              type="button"
                              className="rounded p-0.5 opacity-40 group-hover:opacity-100 hover:bg-background"
                              aria-label={`Remove ${b.path} from ${name}`}
                              onClick={() => actions.removeBinary(name, b.path ?? '')}
                            >
                              <XIcon className="size-3" />
                            </button>
                          )}
                        </code>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">any binary</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-4 text-right align-top">
                  {!managed && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for rule ${name}`}
                            disabled={!canWrite}
                          />
                        }
                      >
                        <EllipsisIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => actions.removeRule(name)}
                        >
                          Remove rule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
