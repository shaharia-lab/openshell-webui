/** Largest OSC 52 copy accepted, in decoded bytes. */
export const OSC52_MAX_BYTES = 1024 * 1024

/**
 * The text an OSC 52 sequence (`ESC ] 52 ; <targets> ; <base64> BEL`) asks to
 * put on the clipboard, given the part after `52;`. Programs that draw their
 * own selection while capturing the mouse, such as Claude Code, copy this
 * way; xterm.js ignores the sequence unless a handler is registered.
 *
 * Returns null for anything that is not a plain write: clipboard reads
 * (`?`), which would let a program in the sandbox read the user's clipboard;
 * clears (empty payload); malformed base64; and oversized copies.
 */
export function parseOsc52(data: string): string | null {
  const sep = data.indexOf(';')
  if (sep < 0) return null
  const payload = data.slice(sep + 1)
  if (!payload || payload === '?') return null
  // base64 grows data by 4/3; check before decoding.
  if ((payload.length * 3) / 4 > OSC52_MAX_BYTES + 3) return null
  let binary: string
  try {
    binary = atob(payload)
  } catch {
    return null
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}
