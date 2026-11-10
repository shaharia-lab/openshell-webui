/**
 * Puts `text` on the clipboard. Call it from a user gesture (key press,
 * click).
 *
 * The async Clipboard API is missing outside secure contexts (the WebUI
 * behind a plain-HTTP hostname, an SSH tunnel to a non-loopback name, ...)
 * and can reject for permission reasons, so the synchronous copy command
 * runs first: it fires a `copy` event we fill in ourselves, works in any
 * context during a gesture, and needs no permission. The Clipboard API is
 * the fallback.
 */
export async function copyText(text: string): Promise<boolean> {
  if (execCopy(text)) return true
  if (!navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function execCopy(text: string): boolean {
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return
    e.clipboardData.setData('text/plain', text)
    e.preventDefault()
    // Keep xterm's own copy handler from overwriting the data.
    e.stopImmediatePropagation()
    filled = true
  }
  let filled = false
  document.addEventListener('copy', onCopy, true)
  try {
    return document.execCommand('copy') && filled
  } catch {
    return false
  } finally {
    document.removeEventListener('copy', onCopy, true)
  }
}
