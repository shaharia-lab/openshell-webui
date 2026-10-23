import { useEffect } from 'react'

const APP = 'OpenShell WebUI'

/** Sets the tab title: "demo · Policy · OpenShell WebUI". Empty parts are skipped. */
export function useDocumentTitle(...parts: (string | undefined | false)[]) {
  const title = [...parts.filter(Boolean), APP].join(' · ')
  useEffect(() => {
    document.title = title
    return () => {
      document.title = APP
    }
  }, [title])
}
