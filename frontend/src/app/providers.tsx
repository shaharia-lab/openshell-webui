import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { createQueryClient } from './query-client'
import { ConfirmProvider } from '@/components/common/confirm'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/lib/theme'

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [qc] = useState(() => client ?? createQueryClient())
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <TooltipProvider delay={300}>
          <ConfirmProvider>{children}</ConfirmProvider>
          <Toaster richColors closeButton position="bottom-right" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
