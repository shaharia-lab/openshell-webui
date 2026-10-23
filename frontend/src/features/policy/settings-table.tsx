import { PencilIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { errorMessage } from '@/api/errors'
import { useConfirm } from '@/components/common/confirm-context'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { SimpleSelect } from '@/components/common/simple-select'
import { StatusBadge } from '@/components/common/status-badge'
import { WriteButton } from '@/components/common/write-button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { SettingValue } from '@/gen/sandbox'
import { enumLabel } from '@/lib/format'
import { kindOf, settingText, type Kind } from './settings'

export interface SettingRow {
  key: string
  value?: SettingValue
  /** Where an effective sandbox setting comes from (sandbox or global). */
  scope?: string
}

interface SettingsTableProps {
  rows: SettingRow[]
  onSave: (key: string, value: SettingValue) => Promise<unknown>
  /** Present when settings in this scope can be removed (gateway-global only). */
  onDelete?: (key: string) => Promise<unknown>
  empty?: string
}

const col = columnsFor<SettingRow>()

export function SettingsTable({
  rows,
  onSave,
  onDelete,
  empty = 'No settings.',
}: SettingsTableProps) {
  const [editing, setEditing] = useState<SettingRow | null>(null)
  const confirm = useConfirm()
  const hasScope = rows.some((r) => r.scope)
  const columns = useMemo(
    () => [
      col.accessor('key', {
        header: 'Setting',
        cell: ({ getValue }) => (
          <code className="font-mono text-xs break-all whitespace-normal">{getValue()}</code>
        ),
      }),
      col.accessor((r) => settingText(r.value), {
        id: 'value',
        header: 'Value',
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="font-mono text-xs">{getValue()}</span>
          ) : (
            <span className="text-muted-foreground">default</span>
          ),
      }),
      ...(hasScope
        ? [
            col.accessor((r) => enumLabel(r.scope, 'SETTING_SCOPE_'), {
              id: 'scope',
              header: 'From',
              cell: ({ getValue }) =>
                getValue() && getValue() !== 'Unspecified' ? (
                  <StatusBadge tone="neutral" dot={false}>
                    {getValue()}
                  </StatusBadge>
                ) : null,
            }),
          ]
        : []),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-20 text-right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <WriteButton
              size="icon-sm"
              variant="ghost"
              aria-label={`Edit ${row.original.key}`}
              onClick={() => setEditing(row.original)}
            >
              <PencilIcon />
            </WriteButton>
            {onDelete && settingText(row.original.value) && (
              <WriteButton
                size="icon-sm"
                variant="ghost"
                aria-label={`Clear ${row.original.key}`}
                onClick={() =>
                  confirm({
                    title: `Clear ${row.original.key}?`,
                    description:
                      'The setting returns to its default for every sandbox that does not set it.',
                    confirmLabel: 'Clear',
                    destructive: true,
                    onConfirm: () => onDelete(row.original.key),
                  })
                }
              >
                <Trash2Icon />
              </WriteButton>
            )}
          </div>
        ),
      }),
    ],
    [hasScope, onDelete, confirm],
  )

  return (
    <>
      <DataTable data={rows} columns={columns} getRowId={(r) => r.key} empty={empty} />
      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        size="sm"
        title={`Set ${editing?.key ?? ''}`}
      >
        {editing && <SettingForm row={editing} onSave={onSave} onDone={() => setEditing(null)} />}
      </FormDialog>
    </>
  )
}

function SettingForm({
  row,
  onSave,
  onDone,
}: {
  row: SettingRow
  onSave: SettingsTableProps['onSave']
  onDone: () => void
}) {
  const [kind, setKind] = useState<Kind>(kindOf(row.value) ?? 'bool')
  const [text, setText] = useState(settingText(row.value))
  const [bool, setBool] = useState(row.value?.bool_value ?? false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    let value: SettingValue
    if (kind === 'bool') value = { bool_value: bool }
    else if (kind === 'int') {
      if (!/^-?\d+$/.test(text.trim())) return setError(new Error('Enter a whole number.'))
      value = { int_value: text.trim() }
    } else value = { string_value: text }
    setPending(true)
    try {
      await onSave(row.key, value)
      onDone()
    } catch (err) {
      setError(new Error(errorMessage(err)))
    } finally {
      setPending(false)
    }
  }

  return (
    <DialogForm onSubmit={submit} submitLabel="Save" pending={pending} error={error}>
      <Field>
        <FieldLabel htmlFor="setting-kind">Type</FieldLabel>
        <SimpleSelect
          id="setting-kind"
          className="w-full"
          value={kind}
          onValueChange={setKind}
          options={[
            { value: 'bool', label: 'Boolean' },
            { value: 'int', label: 'Integer' },
            { value: 'string', label: 'Text' },
          ]}
        />
        <FieldDescription>The gateway rejects a type the setting does not accept.</FieldDescription>
      </Field>
      {kind === 'bool' ? (
        <Field orientation="horizontal">
          <Switch id="setting-bool" checked={bool} onCheckedChange={setBool} />
          <FieldLabel htmlFor="setting-bool">{bool ? 'Enabled' : 'Disabled'}</FieldLabel>
        </Field>
      ) : (
        <Field>
          <FieldLabel htmlFor="setting-value">Value</FieldLabel>
          <Input
            id="setting-value"
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode={kind === 'int' ? 'numeric' : undefined}
            autoFocus
          />
        </Field>
      )}
    </DialogForm>
  )
}
