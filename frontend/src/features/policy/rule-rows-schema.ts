import { z } from 'zod'

import { ruleRowError, type RuleRow } from '@/lib/policy'

/** Validates editable rule rows; errors land on each row's endpoint field. */
export const ruleRowsSchema = z
  .array(
    z.object({
      binary: z.string(),
      endpoint: z.string(),
      access: z.enum([
        'NETWORK_ACCESS_PRESET_READ_ONLY',
        'NETWORK_ACCESS_PRESET_READ_WRITE',
        'NETWORK_ACCESS_PRESET_FULL',
        'NETWORK_ACCESS_PRESET_UNSPECIFIED',
      ]),
      l4: z.boolean(),
      rule: z.string().optional(),
    }),
  )
  .superRefine((rows, ctx) => {
    rows.forEach((r, i) => {
      const err = ruleRowError(r as RuleRow)
      if (err) ctx.addIssue({ code: 'custom', message: err, path: [i, 'endpoint'] })
    })
  })
