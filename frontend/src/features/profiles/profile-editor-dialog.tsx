import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useRpc } from '@/api/mutations'
import { CodeEditor } from '@/components/common/code-editor'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { Button } from '@/components/ui/button'
import { FieldDescription } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { profileToYaml } from './profile-yaml'
import type { ProviderProfile, ProviderProfileDiagnostic } from '@/gen/openshell'

const EXAMPLE = `id: my-api
display_name: My API
category: other
credentials:
  - name: api_key
    env_vars: [MY_API_KEY]
    required: true
    auth_style: header
    header_name: x-api-key
endpoints:
  - { host: api.example.com, port: 443, protocol: rest, access: read-write, enforcement: enforce }
binaries: [/usr/bin/curl]
`

function Diagnostics({ items }: { items: ProviderProfileDiagnostic[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((d, i) => (
        <li
          key={i}
          className={
            d.severity === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-destructive'
          }
        >
          {d.field && <code className="mr-1 font-mono text-xs">{d.field}</code>}
          {d.message}
        </li>
      ))}
    </ul>
  )
}

interface ProfileEditorDialogProps {
  gw: string
  ws: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The profile to edit; without it the dialog imports a new one. */
  profile?: ProviderProfile
}

/** Imports a new provider profile, or edits a custom one, as YAML. */
export function ProfileEditorDialog({
  gw,
  ws,
  open,
  onOpenChange,
  profile,
}: ProfileEditorDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={profile ? `Edit profile ${profile.id}` : 'Import provider profile'}
      description={
        profile
          ? 'Changes apply to providers of this type. The gateway rejects the update if someone changed the profile meanwhile.'
          : `Adds a provider type to workspace ${ws}. Paste CLI YAML (as for openshell provider profile import), proto YAML or JSON.`
      }
    >
      <ProfileEditorForm gw={gw} ws={ws} profile={profile} onDone={() => onOpenChange(false)} />
    </FormDialog>
  )
}

function ProfileEditorForm({
  gw,
  ws,
  profile,
  onDone,
}: {
  gw: string
  ws: string
  profile?: ProviderProfile
  onDone: () => void
}) {
  const [text, setText] = useState(() => (profile ? profileToYaml(profile) : ''))
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<{
    ok: boolean
    diagnostics: ProviderProfileDiagnostic[]
    message?: string
  } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const lint = useRpc(gw, 'LintProviderProfiles', { toastErrors: false })
  const importProfiles = useRpc(gw, 'ImportProviderProfiles', { toastErrors: false })
  const update = useRpc(gw, 'UpdateProviderProfiles', { toastErrors: false })

  const runCheck = async () => {
    setChecking(true)
    try {
      const p = await api.convertProfile(text)
      const r = await lint.mutateAsync({
        ws,
        body: { profiles: [{ profile: p, source: 'webui' }] },
      })
      setCheck({
        ok: !!r.valid,
        diagnostics: r.diagnostics ?? [],
        message: r.valid ? `Valid profile ${p.id}.` : undefined,
      })
    } catch (e) {
      setCheck({ ok: false, diagnostics: [], message: errorMessage(e) })
    } finally {
      setChecking(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const p = await api.convertProfile(text)
      const item = { profile: p, source: 'webui' }
      if (profile) {
        const r = await update.mutateAsync({
          ws,
          body: {
            id: profile.id,
            profile: item,
            expected_resource_version: profile.resource_version,
          },
        })
        if (!r.updated) {
          setCheck({ ok: false, diagnostics: r.diagnostics ?? [], message: 'Not updated.' })
          return
        }
        toast.success(`Profile ${p.id} updated.`)
      } else {
        const r = await importProfiles.mutateAsync({ ws, body: { profiles: [item] } })
        if (!r.imported) {
          setCheck({ ok: false, diagnostics: r.diagnostics ?? [], message: 'Not imported.' })
          return
        }
        toast.success(`Profile ${p.id} imported.`)
      }
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <DialogForm
      onSubmit={submit}
      submitLabel={profile ? 'Save profile' : 'Import'}
      pending={pending}
      error={error}
      submitDisabled={!text.trim()}
      extraActions={
        <Button
          type="button"
          variant="outline"
          onClick={runCheck}
          disabled={checking || !text.trim()}
        >
          {checking ? <Spinner /> : <CheckIcon />} Check
        </Button>
      }
    >
      <CodeEditor
        aria-label="Provider profile"
        value={text}
        onChange={(v) => {
          setText(v)
          setCheck(null)
        }}
        placeholder={EXAMPLE}
        height="min(55dvh, 30rem)"
      />
      {!profile && (
        <FieldDescription>
          “Check” asks the gateway to lint the profile without saving it.
        </FieldDescription>
      )}
      {check && (
        <div className="space-y-1">
          {check.message && (
            <p
              className={
                check.ok
                  ? 'text-sm text-emerald-700 dark:text-emerald-400'
                  : 'text-sm text-destructive'
              }
            >
              {check.message}
            </p>
          )}
          <Diagnostics items={check.diagnostics} />
        </div>
      )}
    </DialogForm>
  )
}
