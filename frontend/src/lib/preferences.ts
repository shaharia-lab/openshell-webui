import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const REFRESH_INTERVALS = [0, 5_000, 15_000, 30_000, 60_000] as const
export type RefreshInterval = (typeof REFRESH_INTERVALS)[number]

interface Preferences {
  /** Selected gateway name; empty until the gateway list loads. */
  gateway: string
  /** Selected workspace name, or "*" for all workspaces. */
  workspace: string
  /** Auto-refresh period in ms; 0 turns it off. */
  refreshInterval: RefreshInterval
  setGateway: (gateway: string) => void
  setWorkspace: (workspace: string) => void
  setRefreshInterval: (ms: RefreshInterval) => void
}

// localStorage can throw in private windows; fall back to memory then.
const safeStorage = createJSONStorage(() => {
  try {
    localStorage.setItem('__probe', '1')
    localStorage.removeItem('__probe')
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
  }
})

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      gateway: '',
      workspace: 'default',
      refreshInterval: 5_000,
      // A new gateway has its own workspaces; start from its default one.
      setGateway: (gateway) => set({ gateway, workspace: 'default' }),
      setWorkspace: (workspace) => set({ workspace }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
    }),
    { name: 'openshell-webui', storage: safeStorage },
  ),
)
