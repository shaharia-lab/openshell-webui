import type { ComponentProps } from 'react'
import { Link } from 'react-router'

import { TabsTrigger } from '@/components/ui/tabs'

type LinkTabProps = Omit<ComponentProps<typeof TabsTrigger>, 'render' | 'nativeButton'> & {
  /** Where the tab leads. The page derives the active tab from the URL. */
  to: string
}

/**
 * A tab that is a real link, so it can be opened in a new browser tab
 * (middle-click, Ctrl/⌘-click, the context menu). Use it in a `Tabs` whose
 * `value` comes from the route, without `onValueChange`: the link does the
 * navigating.
 */
export function LinkTab({ to, ...props }: LinkTabProps) {
  return <TabsTrigger {...props} nativeButton={false} render={<Link to={to} />} />
}
