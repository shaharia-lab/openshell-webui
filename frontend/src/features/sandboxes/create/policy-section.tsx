import { CodeIcon, FileUpIcon, ListIcon, ShieldIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useSandboxes } from '@/api/queries'
import { CodeEditor } from '@/components/common/code-editor'
import { FormSection } from '@/components/common/form-section'
import { SimpleSelect } from '@/components/common/simple-select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { GetSandboxPolicyStatusResponse } from '@/gen/openshell'
import {
  filesystemForm,
  formPolicy,
  identityError,
  initialPolicyBuilder,
  LANDLOCK_OPTIONS,
  pathsError,
  processForm,
  type FilesystemForm,
  type PolicyBuilderState,
  type ProcessForm,
} from './policy-builder'
import {
  emptyRuleRow,
  isBlankRow,
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
  networkOpen: boolean
  onNetworkOpenChange: (open: boolean) => void
}

// Policies are a few KB; anything this big is the wrong file.
const MAX_POLICY_FILE = 1024 * 1024

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function PolicySection({
  gw,
  ws,
  children,
  rows,
  setRows,
  state,
  onChange,
  providerHints,
  networkOpen,
  onNetworkOpenChange,
}: PolicySectionProps) {
  const sandboxes = useSandboxes(gw, ws)
  const [loading, setLoading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const names = (sandboxes.data?.sandboxes ?? []).map((s) => s.metadata?.name ?? '').filter(Boolean)
  const advancedNames = Object.keys(state.advanced)
  const ruleCount = rows.filter((r) => !isBlankRow(r)).length + advancedNames.length
  const kept = state.base ? `Kept from ${state.baseName}` : 'Default'

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
      onChange({ ...initialPolicyBuilder, base, baseName: name, advanced: split.advanced })
      setRows(split.rows.length ? split.rows : [emptyRuleRow()])
    } catch (e) {
      toast.error(`Could not read the policy of ${name}`, { description: errorMessage(e) })
    } finally {
      setLoading(false)
    }
  }

  // A loaded file replaces the policy, exactly as if it were pasted into the YAML editor.
  const loadFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_POLICY_FILE) {
      toast.error(`${file.name} is too large for a policy file.`)
      return
    }
    try {
      const yaml = await file.text()
      onChange({ ...initialPolicyBuilder, yaml })
      setRows([emptyRuleRow()])
      toast.success(`Loaded ${file.name}`)
    } catch (e) {
      toast.error(`Could not read ${file.name}`, { description: errorMessage(e) })
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
        <input
          ref={fileInput}
          type="file"
          accept=".yaml,.yml,.json,application/yaml,application/json"
          className="hidden"
          aria-label="Policy file"
          onChange={(e) => {
            void loadFile(e.target.files?.[0])
            e.target.value = '' // so loading the same file again fires onChange
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => fileInput.current?.click()}
        >
          <FileUpIcon /> Load file
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
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
          <FormSection
            title="Network access"
            summary={ruleCount ? plural(ruleCount, 'rule') : 'No access'}
            open={networkOpen}
            onOpenChange={onNetworkOpenChange}
          >
            <FieldDescription>
              Each row lets one program reach one host:port. Everything else is denied. You can
              change these rules after creation.
            </FieldDescription>
            {children}
            {advancedNames.length > 0 && (
              <FieldDescription>
                {advancedNames.length} advanced rule{advancedNames.length > 1 ? 's' : ''} from the
                copied policy ({advancedNames.join(', ')}) {advancedNames.length > 1 ? 'are' : 'is'}{' '}
                kept as is. Use “Edit as YAML” to change {advancedNames.length > 1 ? 'them' : 'it'}.
              </FieldDescription>
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
          </FormSection>

          <FormSection title="Filesystem" summary={state.filesystem ? 'Custom' : kept}>
            <FilesystemFields
              value={state.filesystem}
              onChange={(filesystem) => onChange({ ...state, filesystem })}
              onCustomize={() => onChange({ ...state, filesystem: filesystemForm(state.base) })}
              keptFrom={state.base ? state.baseName : null}
            />
          </FormSection>

          <FormSection
            title="Process"
            summary={
              state.process
                ? [state.process.user, state.process.group].filter(Boolean).join(':') ||
                  'Runtime default'
                : kept
            }
          >
            <ProcessFields
              value={state.process}
              onChange={(process) => onChange({ ...state, process })}
              onCustomize={() => onChange({ ...state, process: processForm(state.base) })}
              keptFrom={state.base ? state.baseName : null}
            />
          </FormSection>
        </>
      ) : (
        <>
          <FieldDescription>
            {state.base
              ? 'This is the full policy of the new sandbox.'
              : 'Sections you leave out keep the default; sections you add replace it.'}{' '}
            Going back to the form discards YAML changes.
          </FieldDescription>
          <CodeEditor
            aria-label="Policy YAML"
            value={state.yaml}
            onChange={(yaml) => onChange({ ...state, yaml })}
            height="18rem"
          />
          {providerHints.length > 0 && (
            <FieldDescription>
              Added by the selected providers, no rule needed: {providerHints.join('; ')}.
            </FieldDescription>
          )}
        </>
      )}
    </div>
  )
}

const FIXED = 'Fixed once the sandbox starts; it cannot be changed later.'

function FilesystemFields({
  value,
  onChange,
  onCustomize,
  keptFrom,
}: {
  value: FilesystemForm | null
  onChange: (v: FilesystemForm | null) => void
  onCustomize: () => void
  keptFrom: string | null
}) {
  if (!value) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <FieldDescription className="flex-1">
          {keptFrom
            ? `Uses the filesystem settings of ${keptFrom}.`
            : 'Uses the policy shipped in the image, or else the gateway default: system paths read-only, /tmp and the working directory read-write.'}{' '}
          {FIXED}
        </FieldDescription>
        <Button type="button" variant="outline" size="sm" onClick={onCustomize}>
          Customize
        </Button>
      </div>
    )
  }
  const roError = pathsError(value.readOnly)
  const rwError = pathsError(value.readWrite)
  return (
    <>
      <FieldDescription>
        Paths the sandbox may read or write; everything else is hidden. One absolute path per line.{' '}
        {FIXED}
      </FieldDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!roError || undefined}>
          <FieldLabel htmlFor="fs-read-only">Read-only</FieldLabel>
          <Textarea
            id="fs-read-only"
            rows={5}
            value={value.readOnly}
            onChange={(e) => onChange({ ...value, readOnly: e.target.value })}
            aria-invalid={!!roError || undefined}
            className="font-mono text-xs"
            spellCheck={false}
          />
          {roError && <FieldError>{roError}</FieldError>}
        </Field>
        <Field data-invalid={!!rwError || undefined}>
          <FieldLabel htmlFor="fs-read-write">Read-write</FieldLabel>
          <Textarea
            id="fs-read-write"
            rows={5}
            value={value.readWrite}
            onChange={(e) => onChange({ ...value, readWrite: e.target.value })}
            aria-invalid={!!rwError || undefined}
            className="font-mono text-xs"
            spellCheck={false}
          />
          {rwError && <FieldError>{rwError}</FieldError>}
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Field orientation="horizontal" className="w-auto">
          <Checkbox
            id="fs-workdir"
            checked={value.includeWorkdir}
            onCheckedChange={(c) => onChange({ ...value, includeWorkdir: !!c })}
          />
          <FieldLabel htmlFor="fs-workdir">Working directory read-write</FieldLabel>
        </Field>
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor="fs-landlock">Landlock</FieldLabel>
          <SimpleSelect
            id="fs-landlock"
            size="sm"
            value={value.landlock}
            onValueChange={(landlock) => onChange({ ...value, landlock })}
            options={LANDLOCK_OPTIONS}
          />
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => onChange(null)}
        >
          {keptFrom ? `Use ${keptFrom}'s` : 'Use the default'}
        </Button>
      </div>
    </>
  )
}

function ProcessFields({
  value,
  onChange,
  onCustomize,
  keptFrom,
}: {
  value: ProcessForm | null
  onChange: (v: ProcessForm | null) => void
  onCustomize: () => void
  keptFrom: string | null
}) {
  if (!value) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <FieldDescription className="flex-1">
          {keptFrom
            ? `Runs as ${keptFrom} does.`
            : "Runs as the image's user, or the sandbox user."}{' '}
          {FIXED}
        </FieldDescription>
        <Button type="button" variant="outline" size="sm" onClick={onCustomize}>
          Customize
        </Button>
      </div>
    )
  }
  const userError = identityError(value.user)
  const groupError = identityError(value.group)
  return (
    <>
      <FieldDescription>
        The user and group the main process runs as: <code>sandbox</code> or a numeric ID (not 0).
        Empty leaves it to the runtime. {FIXED}
      </FieldDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!userError || undefined}>
          <FieldLabel htmlFor="proc-user">Run as user</FieldLabel>
          <Input
            id="proc-user"
            value={value.user}
            onChange={(e) => onChange({ ...value, user: e.target.value })}
            aria-invalid={!!userError || undefined}
            placeholder="sandbox"
            autoComplete="off"
          />
          {userError && <FieldError>{userError}</FieldError>}
        </Field>
        <Field data-invalid={!!groupError || undefined}>
          <FieldLabel htmlFor="proc-group">Run as group</FieldLabel>
          <Input
            id="proc-group"
            value={value.group}
            onChange={(e) => onChange({ ...value, group: e.target.value })}
            aria-invalid={!!groupError || undefined}
            placeholder="sandbox"
            autoComplete="off"
          />
          {groupError && <FieldError>{groupError}</FieldError>}
        </Field>
      </div>
      <div className="flex">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => onChange(null)}
        >
          {keptFrom ? `Use ${keptFrom}'s` : 'Use the default'}
        </Button>
      </div>
    </>
  )
}
