import { z } from 'zod'

import type { ServiceAuthorizationMode } from '@/gen/openshell'
import { NAME_RE } from '@/lib/validation'

export interface ServiceRow {
  name: string
  port: string
  auth: ServiceAuthorizationMode
}

export const serviceRowsSchema = z
  .array(z.object({ name: z.string(), port: z.string(), auth: z.string() }))
  .superRefine((rows, ctx) => {
    const seen = new Set<string>()
    rows.forEach((r, i) => {
      const name = r.name.trim()
      const port = Number(r.port)
      if (name && !NAME_RE.test(name))
        ctx.addIssue({ code: 'custom', message: 'Service name is not valid.', path: [i, 'name'] })
      if (seen.has(name))
        ctx.addIssue({
          code: 'custom',
          message: `${name || 'The unnamed service'} is listed twice.`,
          path: [i, 'name'],
        })
      seen.add(name)
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        ctx.addIssue({ code: 'custom', message: 'Port must be 1 to 65535.', path: [i, 'port'] })
    })
  })
