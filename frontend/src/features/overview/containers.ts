import type { Container } from '@/api/types'

// Older backends send no workspace; OpenShell names containers
// "openshell-<workspace>--<sandbox>-<id>[-supervisor]", which gives it too.
export const workspaceOf = (c: Container) =>
  c.workspace || c.name.match(/^openshell-(.+?)--/)?.[1] || 'default'
