import {
  BoxIcon,
  FileBadgeIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LayoutTemplateIcon,
  ScrollTextIcon,
  ServerIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match only the exact path (for "/"). */
  end?: boolean
}

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workloads',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboardIcon, end: true },
      { to: '/sandboxes', label: 'Sandboxes', icon: BoxIcon },
      { to: '/logs', label: 'Logs', icon: ScrollTextIcon },
      { to: '/services', label: 'Services', icon: GlobeIcon },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: '/providers', label: 'Providers', icon: KeyRoundIcon },
      { to: '/profiles', label: 'Provider profiles', icon: FileBadgeIcon },
      { to: '/templates', label: 'Templates', icon: LayoutTemplateIcon },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/workspaces', label: 'Workspaces', icon: UsersIcon },
      { to: '/gateway', label: 'Gateway', icon: ServerIcon },
    ],
  },
]
