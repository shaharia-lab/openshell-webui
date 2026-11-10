import { useEffect } from 'react'
import { useBlocker } from 'react-router'

/**
 * While `when` holds, asks before anything takes the user off this page:
 * links and tab changes inside the WebUI (a `window.confirm` with `message`)
 * and reloading or closing the browser tab (the browser's own prompt, which
 * ignores custom text). Moves that keep the path, such as a search param
 * change, pass.
 */
export function useLeaveGuard(when: boolean, message: string) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(message)) blocker.proceed()
    else blocker.reset()
  }, [blocker, message])

  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Older browsers show the prompt only when returnValue is set.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])
}
