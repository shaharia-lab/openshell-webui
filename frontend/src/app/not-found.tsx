import { CompassIcon } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/use-document-title'

export function NotFoundPage() {
  useDocumentTitle('Not found')
  return (
    <EmptyState
      icon={<CompassIcon />}
      title="Page not found"
      description="This page does not exist in the console."
      action={<Button render={<Link to="/" />}>Go to the overview</Button>}
    />
  )
}
