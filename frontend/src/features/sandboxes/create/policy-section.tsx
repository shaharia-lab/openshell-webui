import { CodeIcon, ListIcon, ShieldIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useSandboxes } from '@/api/queries'
import { CodeEditor } from '@/components/common/code-editor'
import { SimpleSelect } from '@/components/common/simple-select'
import { Button } from '@/components/ui/button'
import { FieldDescription } from '@/components/ui/field'
import type { GetSandboxPolicyStatusResponse } from '@/gen/openshell'
import { formPolicy, initialPolicyBuilder, type PolicyBuilderState } from './policy-builder'
import {
  emptyRuleRow,
  policyToYaml,
  splitPolicyRules,
  withoutProviderRules,
  type RuleRow,
} from '@/lib/policy'

interface PolicySectionProps {
  gw: string
  ws: string
  /** The rule rows editor of the surrounding form. */
  children: ReactNode
  rows: RuleRow[]
  setRows: (rows: RuleRow[]) => void
  state: PolicyBuilderState
  onChange: (state: PolicyBuilderState) => void
  /** Endpoints that selected providers add on their own. */
  providerHints: string[]
}

export function PolicySection({
  gw,
  ws,
  children,
  rows,
  setRows,
  state,
  onChange,
  providerHints,
}: PolicySectionProps) {
  const sandboxes = useSandboxes(gw, ws)
  const [loading, setLoading] = useState(false)
  const names = (sandboxes.data?.sandboxes ?? []).map((s) => s.metadata?.name ?? '').filter(Boolean)
  const advancedNames = Object.keys(state.advanced)

  const pickBase = async (name: string) => {
    if (!name) {
      onChange(initialPolicyBuilder)
      setRows([emptyRuleRow()])
      return
    }
    setLoading(true)
    try {
      const res = await api.get<GetSandboxPolicyStatusResponse>(
        gw,
        `sandboxes/${encodeURIComponent(name)}/policy`,
        {
          workspace: ws,
        },
      )
      const base = withoutProviderRules(res.revision?.policy)
      const split = splitPolicyRules(base)
      onChange({ base, baseName: name, advanced: split.advanced, yaml: null })
      setRows(split.rows.length ? split.rows : [emptyRuleRow()])
    } catch (e) {
      toast.error(`Could not read the policy of ${name}`, { description: errorMessage(e) })
    } finally {
      setLoading(false)
    }
  }

  const toYaml = () => {
    try {
      onChange({ ...state, yaml: policyToYaml(formPolicy(state, rows)) })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldIcon className="size-4 text-muted-foreground" />
        <span className="text-sm">Start from</span>
        <SimpleSelect
          aria-label="Policy base"
          size="sm"
          className="min-w-56"
          value={state.baseName}
          disabled={loading}
          onValueChange={pickBase}
          options={[
            { value: '', label: 'Gateway default (no network access)' },
            ...names.map((n) => ({ value: n, label: `Copy policy of ${n}` })),
          ]}
        />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => (state.yaml === null ? toYaml() : onChange({ ...state, yaml: null }))}
        >
          {state.yaml === null ? (
            <>
              <CodeIcon /> Edit as YAML
            </>
          ) : (
            <>
              <ListIcon /> Back to the form
            </>
          )}
        </Button>
      </div>

      {state.yaml === null ? (
        <>
          {children}
          {advancedNames.length > 0 && (
            <FieldDescription>
              {advancedNames.length} advanced rule{advancedNames.length > 1 ? 's' : ''} from the
              copied policy ({advancedNames.join(', ')}) {advancedNames.length > 1 ? 'are' : 'is'}{' '}
              kept as is. Use “Edit as YAML” to change {advancedNames.length > 1 ? 'them' : 'it'}.
            </FieldDescription>
          )}
        </>
      ) : (
        <>
          <FieldDescription>
            {state.base
              ? 'This is the full policy of the new sandbox.'
              : 'Only network rules are shown. Sections you leave out keep the gateway default; sections you add replace it.'}{' '}
            Going back to the form discards YAML changes.
          </FieldDescription>
          <CodeEditor
            aria-label="Policy YAML"
            value={state.yaml}
            onChange={(yaml) => onChange({ ...state, yaml })}
            height="18rem"
          />
        </>
      )}

      {providerHints.length > 0 && (
        <FieldDescription>
          Added by the selected providers, no rule needed: {providerHints.join('; ')}.
        </FieldDescription>
      )}
      <FieldDescription>
        Not sure what the agent needs? Start with no rules, run it, then approve the policy
        proposals OpenShell drafts from denied traffic.
      </FieldDescription>
    </div>
  )
}
