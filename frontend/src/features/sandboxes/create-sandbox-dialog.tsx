import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronRightIcon, KeyRoundIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { boundProviders, unattachedBindingProvider } from './create/credential-binding'
import {
  initialPolicyBuilder,
  resolvePolicy,
  type PolicyBuilderState,
} from './create/policy-builder'
import { PolicySection } from './create/policy-section'
import { createSandboxRequest } from './create/request'
import { serviceRowsSchema, type ServiceRow } from './create/services'
import { ServicesEditor } from './create/services-editor'
import { useRpc } from '@/api/mutations'
import {
  useGatewayInfo,
  useProfiles,
  useProviders,
  useTemplates,
  useWorkspaces,
} from '@/api/queries'
import { ALL_WORKSPACES } from '@/api/types'
import type { SandboxRestartPolicy } from '@/gen/openshell'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FormField } from '@/components/common/form-field'
import { KeyValueEditor } from '@/components/common/key-value-editor'
import { SimpleSelect } from '@/components/common/simple-select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RuleRowsEditor } from '@/features/policy/rule-rows-editor'
import { ruleRowsSchema } from '@/features/policy/rule-rows-schema'
import { templateSummary } from '@/features/templates/summary'
import { useScope } from '@/hooks/use-scope'
import { addRuleOps, emptyRuleRow } from '@/lib/policy'
import { sandboxHref } from '@/lib/sandbox'
import { shellSplit } from '@/lib/shell'
import {
  cpuSchema,
  envRowsSchema,
  labelRowsSchema,
  memorySchema,
  nameSchema,
} from '@/lib/validation'

const RESTART_OPTIONS: { value: '' | SandboxRestartPolicy; label: string }[] = [
  { value: '', label: 'Gateway default (never)' },
  { value: 'SANDBOX_RESTART_POLICY_NEVER', label: 'Never' },
  { value: 'SANDBOX_RESTART_POLICY_ON_FAILURE', label: 'On failure' },
  { value: 'SANDBOX_RESTART_POLICY_ALWAYS', label: 'Always' },
]

const schema = z.object({
  workspace: z.string().min(1, 'Pick a workspace.'),
  name: nameSchema,
  image: z.string().trim(),
  template: z.string(),
  restart: z.string(),
  command: z.string().superRefine((v, ctx) => {
    try {
      shellSplit(v)
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: (e as Error).message })
    }
  }),
  cpu: cpuSchema,
  memory: memorySchema,
  gpu: z.boolean(),
  gpuCount: z.string().regex(/^(\d{1,2})?$/, 'Enter a number of GPUs, or leave empty for one.'),
  providers: z.array(z.string()),
  env: envRowsSchema,
  labels: labelRowsSchema,
  services: serviceRowsSchema,
  rules: ruleRowsSchema,
})
type Values = z.infer<typeof schema>

const ADVANCED_FIELDS = [
  'command',
  'restart',
  'cpu',
  'memory',
  'gpuCount',
  'env',
  'labels',
  'services',
]

export function CreateSandboxDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { ws } = useScope()
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New sandbox"
      description="Runs a container with no network access except what its policy and providers allow."
    >
      <CreateSandboxForm
        defaultWorkspace={ws === ALL_WORKSPACES ? 'default' : ws}
        onDone={() => onOpenChange(false)}
      />
    </FormDialog>
  )
}

function CreateSandboxForm({
  defaultWorkspace,
  onDone,
}: {
  defaultWorkspace: string
  onDone: () => void
}) {
  const { gw, ws: scopeWs } = useScope()
  const navigate = useNavigate()
  const [policy, setPolicy] = useState<PolicyBuilderState>(initialPolicyBuilder)
  const [error, setError] = useState<unknown>(null)
  /** A provider the policy's credential bindings need but the sandbox does not attach. */
  const [needs, setNeeds] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      workspace: defaultWorkspace,
      name: '',
      image: '',
      template: '',
      restart: '',
      command: '',
      cpu: '',
      memory: '',
      gpu: false,
      gpuCount: '',
      providers: [],
      env: [],
      labels: [],
      services: [],
      rules: [emptyRuleRow()],
    },
  })
  const { control, handleSubmit, setValue, getValues, formState } = form
  const workspace = useWatch({ control, name: 'workspace' })
  const selectedProviders = useWatch({ control, name: 'providers' })
  const rows = useWatch({ control, name: 'rules' })
  const gpu = useWatch({ control, name: 'gpu' })
  const templateName = useWatch({ control, name: 'template' })

  const workspaces = useWorkspaces(gw)
  const providers = useProviders(gw, workspace)
  const profiles = useProfiles(gw, workspace)
  const templates = useTemplates(gw, workspace)
  const info = useGatewayInfo(gw)
  const caps = info.data?.compute_drivers?.[0]?.capabilities?.resource_capabilities
  const gpuSupported = !!(
    caps?.gpu?.default_selection_supported || caps?.gpu?.count_selection_supported
  )

  const providerHints = useMemo(() => {
    const byId = new Map((profiles.data?.profiles ?? []).map((p) => [p.id, p]))
    return (providers.data?.providers ?? [])
      .filter((p) => selectedProviders.includes(p.metadata?.name ?? ''))
      .flatMap((p) => {
        const eps = (byId.get(p.type)?.endpoints ?? []).map((e) => `${e.host}:${e.port}`)
        return eps.length ? [`${p.metadata?.name} allows ${eps.join(', ')}`] : []
      })
  }, [profiles.data, providers.data, selectedProviders])

  const create = useRpc(gw, 'CreateSandbox', { toastErrors: false })
  const merge = useRpc(gw, 'UpdateConfig', { toastErrors: false })

  const submit = async (v: Values) => {
    setError(null)
    setNeeds(null)
    try {
      const pol = await resolvePolicy(policy, v.rules)
      // Rules merged after creation would only fail then, leaving the sandbox without them.
      const unattached = boundProviders(pol.rules).find((p) => !v.providers.includes(p))
      if (unattached) {
        setNeeds(unattached)
        setError(
          new Error(`Not created: a network rule binds credentials to provider '${unattached}'.`),
        )
        return
      }
      const body = createSandboxRequest({ ...v, services: v.services as ServiceRow[] }, pol.policy)
      await create.mutateAsync({ ws: v.workspace, body })

      if (pol.rules.length) {
        // Gateway default base: add the rules to the default policy.
        try {
          const r = await merge.mutateAsync({
            ws: v.workspace,
            body: { sandbox: v.name, merge_operations: addRuleOps(pol.rules) },
          })
          toast.success(`Creating ${v.name}`, {
            description: `${pol.rules.length} network rule${pol.rules.length > 1 ? 's' : ''} added (policy v${r.version}).`,
          })
        } catch (e) {
          toast.warning(`${v.name} was created, but its network rules were not added`, {
            description: `${(e as Error).message}\nAdd them on the sandbox's Policy tab.`,
          })
        }
      } else {
        toast.success(`Creating ${v.name}`)
      }
      onDone()
      navigate(sandboxHref({ workspace: v.workspace, name: v.name }))
    } catch (e) {
      setError(e)
      setNeeds(unattachedBindingProvider(e))
    }
  }
  const onSubmit = handleSubmit(submit, (errors) => {
    // Reveal the collapsed section when one of its fields is invalid.
    if (ADVANCED_FIELDS.some((f) => f in errors)) setAdvancedOpen(true)
  })
  const attachAndRetry = (name: string) => {
    setValue('providers', [...getValues('providers'), name])
    void onSubmit()
  }

  const providerList = providers.data?.providers ?? []
  const templateList = templates.data?.templates ?? []
  const template = templateList.find((t) => t.metadata?.name === templateName)
  // The template supplies the workload; the gateway rejects these fields with it.
  const fromTemplate = !!templateName
  const selectTemplate = (name: string) => {
    setValue('template', name)
    if (!name) return
    for (const f of ['image', 'cpu', 'memory', 'gpuCount'] as const) setValue(f, '')
    setValue('gpu', false)
    setValue('env', [])
  }
  const workspaceNames = (workspaces.data?.workspaces ?? [])
    .map((w) => w.metadata?.name ?? '')
    .filter(Boolean)

  return (
    <DialogForm
      onSubmit={onSubmit}
      submitLabel="Create sandbox"
      pending={formState.isSubmitting}
      error={error}
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="name"
            label="Name"
            render={({ field, id, invalid }) => (
              <Input
                {...field}
                id={id}
                aria-invalid={invalid || undefined}
                placeholder="my-sandbox"
                data-1p-ignore
                autoComplete="off"
                autoFocus
              />
            )}
          />
          {scopeWs === ALL_WORKSPACES ? (
            <FormField
              control={control}
              name="workspace"
              label="Workspace"
              render={({ field, id }) => (
                <SimpleSelect
                  id={id}
                  value={field.value}
                  className="w-full"

                  onValueChange={(v) => {
                    field.onChange(v)
                    setValue('providers', [])
                    setValue('template', '')
                  }}
                  options={workspaceNames.map((n) => ({ value: n, label: n }))}
                />
              )}
            />
          ) : (
            <Field>
              <FieldLabel>Workspace</FieldLabel>
              <Input value={workspace} disabled />
            </Field>
          )}
          <FormField
            control={control}
            name="image"
            label="Image"
            description={
              fromTemplate
                ? 'Set by the template.'
                : "OCI image reference. Empty uses the gateway's default."
            }
            render={({ field, id }) => (
              <Input
                {...field}
                id={id}
                disabled={fromTemplate}
                placeholder={
                  fromTemplate
                    ? template?.spec?.workload?.image || "gateway's default"
                    : 'ghcr.io/org/image:tag'
                }
                className="font-mono text-xs"
                spellCheck={false}
              />
            )}
          />
          <FormField
            control={control}
            name="template"
            label="Template"
            description={
              template
                ? templateSummary(template)
                : templateList.length
                  ? 'Takes image, resources and environment from a saved template.'
                  : 'No templates in this workspace.'
            }
            render={({ field, id }) => (
              <SimpleSelect
                id={id}
                value={field.value}
                className="w-full"

                onValueChange={selectTemplate}
                disabled={!templateList.length}
                options={[
                  { value: '', label: 'None' },
                  ...templateList.map((t) => ({
                    value: t.metadata?.name ?? '',
                    label: t.metadata?.name ?? '',
                  })),
                ]}
              />
            )}
          />
        </div>

        <FieldSet>
          <FieldLegend variant="label">Providers</FieldLegend>
          <FieldDescription>
            Providers inject credentials (as placeholders) and allow their endpoints. Sandboxes
            never see the secret values.
          </FieldDescription>
          {providerList.length ? (
            <Controller
              control={control}
              name="providers"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {providerList.map((p) => {
                    const name = p.metadata?.name ?? ''
                    const checked = field.value.includes(name)
                    return (
                      <FieldLabel key={name} className="w-full">
                        <Field orientation="horizontal">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) =>
                              field.onChange(
                                c ? [...field.value, name] : field.value.filter((x) => x !== name),
                              )
                            }
                          />
                          <div className="grid gap-0.5">
                            <span className="font-medium">{name}</span>
                            <span className="text-xs text-muted-foreground">{p.type}</span>
                          </div>
                        </Field>
                      </FieldLabel>
                    )
                  })}
                </div>
              )}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No providers in this workspace. Create one on the Providers page.
            </p>
          )}
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Network access</FieldLegend>
          <FieldDescription>
            Each row lets one program reach one host:port. Everything else is denied.
          </FieldDescription>
          <PolicySection
            gw={gw}
            ws={workspace}
            rows={rows}
            setRows={(r) => setValue('rules', r)}
            state={policy}
            onChange={setPolicy}
            providerHints={providerHints}
          >
            <RuleRowsEditor control={control} name="rules" />
          </PolicySection>
        </FieldSet>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium">
            <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
            Command, resources, environment, labels and services
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={control}
                  name="command"
                  label="Command"
                  description="Main process, shell-style quoting. Empty keeps a login shell running."
                  className="sm:col-span-2"
                  render={({ field, id, invalid }) => (
                    <Input
                      {...field}
                      id={id}
                      aria-invalid={invalid || undefined}
                      placeholder="python -m http.server 8080"
                      className="font-mono text-xs"
                      spellCheck={false}
                    />
                  )}
                />
                <FormField
                  control={control}
                  name="restart"
                  label="Restart policy"
                  render={({ field, id }) => (
                    <SimpleSelect
                      id={id}
                      className="w-full"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={RESTART_OPTIONS}
                    />
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={control}
                    name="cpu"
                    label="CPU limit"
                    render={({ field, id, invalid }) => (
                      <Input
                        {...field}
                        id={id}
                        aria-invalid={invalid || undefined}
                        placeholder={fromTemplate ? 'From template' : '500m or 2'}
                        disabled={fromTemplate || caps?.cpu?.limit_supported === false}
                      />
                    )}
                  />
                  <FormField
                    control={control}
                    name="memory"
                    label="Memory limit"
                    render={({ field, id, invalid }) => (
                      <Input
                        {...field}
                        id={id}
                        aria-invalid={invalid || undefined}
                        placeholder={fromTemplate ? 'From template' : '512Mi or 4Gi'}
                        disabled={fromTemplate || caps?.memory?.limit_supported === false}
                      />
                    )}
                  />
                </div>
                {gpuSupported && !fromTemplate && (
                  <div className="flex items-end gap-4 sm:col-span-2">
                    <Controller
                      control={control}
                      name="gpu"
                      render={({ field }) => (
                        <Field orientation="horizontal" className="w-auto">
                          <Checkbox
                            id="f-gpu"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <FieldLabel htmlFor="f-gpu">Request GPUs</FieldLabel>
                        </Field>
                      )}
                    />
                    {gpu && caps?.gpu?.count_selection_supported && (
                      <FormField
                        control={control}
                        name="gpuCount"
                        label="Count"
                        className="w-32"
                        render={({ field, id, invalid }) => (
                          <Input
                            {...field}
                            id={id}
                            aria-invalid={invalid || undefined}
                            inputMode="numeric"
                            placeholder="1"
                          />
                        )}
                      />
                    )}
                  </div>
                )}
              </div>
              <FieldSet>
                <FieldLegend variant="label">Environment</FieldLegend>
                {fromTemplate ? (
                  <FieldDescription>
                    Set by the template; a sandbox created from a template cannot add its own. To
                    add variables, create a template with them or create the sandbox without one.
                  </FieldDescription>
                ) : (
                  <>
                    <FieldDescription>Do not put secrets here; use providers.</FieldDescription>
                    <KeyValueEditor control={control} name="env" />
                  </>
                )}
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Labels</FieldLegend>
                <KeyValueEditor
                  control={control}
                  name="labels"
                  addLabel="Add label"
                  keyPlaceholder="team"
                />
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Expose services</FieldLegend>
                <FieldDescription>
                  HTTP ports inside the sandbox to publish through the gateway once it is ready.
                </FieldDescription>
                <ServicesEditor control={control} name="services" />
              </FieldSet>
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>
      </FieldGroup>
      {needs && !selectedProviders.includes(needs) && (
        <Alert>
          <KeyRoundIcon />
          <AlertTitle>This policy needs provider {needs} attached</AlertTitle>
          <AlertDescription>
            {providerList.some((p) => p.metadata?.name === needs) ? (
              <div className="space-y-2">
                <p>
                  A credential_binding in the policy sends {needs}'s credentials, so the sandbox
                  must attach it. Attach it, or remove the binding from the policy.
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={formState.isSubmitting}
                  onClick={() => attachAndRetry(needs)}
                >
                  Attach {needs} and create
                </Button>
              </div>
            ) : (
              <p>
                There is no provider {needs} in workspace {workspace}. Create it on the Providers
                page, or remove the binding from the policy, then create again.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </DialogForm>
  )
}
