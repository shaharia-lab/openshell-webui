import type { SettingValue } from '@/gen/sandbox'

export type Kind = 'string' | 'bool' | 'int'

export function kindOf(v?: SettingValue): Kind | null {
  if (!v) return null
  if (v.bool_value !== undefined) return 'bool'
  if (v.int_value !== undefined) return 'int'
  if (v.string_value !== undefined) return 'string'
  return null
}

/** The value as text; empty when the setting has no configured value. */
export function settingText(v?: SettingValue): string {
  switch (kindOf(v)) {
    case 'bool':
      return String(v!.bool_value)
    case 'int':
      return String(v!.int_value)
    case 'string':
      return v!.string_value ?? ''
    default:
      return v?.bytes_value ? '(binary)' : ''
  }
}
