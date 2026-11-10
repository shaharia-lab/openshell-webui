import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { copyText } from '@/lib/clipboard'
import { api, getSession } from '@/api/client'

export type TerminalStatus = 'idle' | 'connecting' | 'open' | 'exited' | 'closed' | 'error'

interface Control {
  type: 'exit' | 'error'
  code?: number
  message?: string
}

/**
 * The clipboard shortcut a key event asks for. xterm.js copies only through
 * the native copy event (Cmd+C on macOS); on Linux and Windows Ctrl+C reaches
 * the shell as ^C. Like VS Code and Windows Terminal, Ctrl+C copies while
 * there is a selection and interrupts otherwise; Ctrl+Shift+C/V always copy
 * and paste.
 */
export function clipboardAction(e: KeyboardEvent, hasSelection: boolean): 'copy' | 'paste' | null {
  if (e.type !== 'keydown' || !e.ctrlKey || e.altKey || e.metaKey) return null
  const key = e.key.toLowerCase()
  if (key === 'c' && (e.shiftKey || hasSelection)) return 'copy'
  if (key === 'v' && e.shiftKey) return 'paste'
  return null
}

/** Set on the terminal container while the active buffer has scrollback. */
export const SCROLLBACK_CLASS = 'terminal-has-scrollback'

/** How long to wait for the browser's own paste before reading the clipboard. */
const NATIVE_PASTE_MS = 50

interface Options {
  gw: string
  workspace: string
  sandbox: string
}

/**
 * Runs an xterm.js terminal in `container`, bridged to the backend's exec
 * WebSocket: binary frames carry stdin/stdout, text frames carry resize
 * (up) and exit/error (down).
 */
export function useTerminal({ gw, workspace, sandbox }: Options) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('idle')
  const [detail, setDetail] = useState('')
  const [hasSelection, setHasSelection] = useState(false)

  // One xterm instance for the component's lifetime.
  useEffect(() => {
    const container = containerRef.current!
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#e5e5e5',
        // xterm's default slider (foreground at 20%) is hard to see on black.
        scrollbarSliderBackground: 'rgba(229, 229, 229, 0.3)',
        scrollbarSliderHoverBackground: 'rgba(229, 229, 229, 0.5)',
        scrollbarSliderActiveBackground: 'rgba(229, 229, 229, 0.65)',
      },
      scrollback: 5000,
      // When a program captures the mouse, Shift+drag (Option+drag on macOS)
      // still selects text for copying.
      macOptionClickForcesSelection: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const sendResize = () => {
      fit.fit()
      const ws = socketRef.current
      if (ws?.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }
    const observer = new ResizeObserver(sendResize)
    observer.observe(container)

    // xterm 6 fades its scrollbar out unless the pointer is over it, so it is
    // easy to miss that there is history above. Keep it showing (see
    // index.css) while there is anything to scroll to.
    const syncScrollback = () =>
      container.classList.toggle(SCROLLBACK_CLASS, term.buffer.active.length > term.rows)
    const disposables = [
      term.onWriteParsed(syncScrollback),
      term.onResize(syncScrollback),
      term.buffer.onBufferChange(syncScrollback),
      term.onSelectionChange(() => setHasSelection(term.hasSelection())),
    ]

    // Paste through the browser's own paste event when it fires (no
    // permission prompt, works without a secure context); read the
    // clipboard only when it does not.
    let pasted = false
    const onPaste = () => (pasted = true)
    container.addEventListener('paste', onPaste, true)

    term.attachCustomKeyEventHandler((e) => {
      const action = clipboardAction(e, term.hasSelection())
      if (!action) return true
      if (action === 'copy') {
        // Stop Ctrl+Shift+C opening the browser's element inspector.
        e.preventDefault()
        const text = term.getSelection()
        if (text)
          void copyText(text).then((ok) => {
            if (ok) term.clearSelection()
            else toast.error('Could not copy to the clipboard.')
          })
      } else {
        // Leave the key to the browser, which pastes into xterm's textarea.
        pasted = false
        setTimeout(() => {
          if (pasted) return
          if (!navigator.clipboard?.readText) {
            toast.error('Could not read the clipboard. Try your browser’s Paste menu.')
            return
          }
          navigator.clipboard.readText().then(
            (text) => term.paste(text),
            () => toast.error('Could not read the clipboard. Allow clipboard access and retry.'),
          )
        }, NATIVE_PASTE_MS)
      }
      // Returning false keeps xterm from sending the key to the shell.
      return false
    })
    const enc = new TextEncoder()
    disposables.push(
      term.onData((s) => {
        const ws = socketRef.current
        if (ws?.readyState === WebSocket.OPEN) ws.send(enc.encode(s))
      }),
    )
    return () => {
      observer.disconnect()
      container.removeEventListener('paste', onPaste, true)
      disposables.forEach((d) => d.dispose())
      socketRef.current?.close()
      term.dispose()
    }
  }, [])

  const connect = useCallback(
    async (command?: string) => {
      const term = termRef.current
      if (!term) return
      socketRef.current?.close()
      term.reset()
      setStatus('connecting')
      setDetail('')
      try {
        const { csrf_token } = await getSession()
        // The terminal was replaced (remount) while the session loaded.
        if (termRef.current !== term) return
        fitRef.current?.fit()
        const ws = new WebSocket(
          api.execUrl(gw, sandbox, {
            workspace,
            cols: term.cols,
            rows: term.rows,
            csrf: csrf_token,
            command,
          }),
        )
        ws.binaryType = 'arraybuffer'
        socketRef.current = ws
        let ended = false
        ws.onopen = () => {
          setStatus('open')
          term.focus()
        }
        ws.onmessage = (ev) => {
          if (typeof ev.data !== 'string') {
            term.write(new Uint8Array(ev.data as ArrayBuffer))
            return
          }
          const msg = JSON.parse(ev.data) as Control
          ended = true
          if (msg.type === 'exit') {
            setStatus('exited')
            setDetail(`Process exited with code ${msg.code ?? 0}.`)
          } else {
            setStatus('error')
            setDetail(msg.message ?? 'The session failed.')
          }
        }
        ws.onclose = (ev) => {
          if (socketRef.current !== ws || ended) return
          setStatus(ev.code === 1000 ? 'closed' : 'error')
          if (ev.code !== 1000) setDetail(ev.reason || 'The connection closed unexpectedly.')
        }
      } catch (e) {
        setStatus('error')
        setDetail((e as Error).message)
      }
    },
    [gw, sandbox, workspace],
  )

  const disconnect = useCallback(() => {
    socketRef.current?.close(1000)
  }, [])

  /** Copies the selection; for the toolbar button. */
  const copySelection = useCallback(async () => {
    const term = termRef.current
    const text = term?.getSelection()
    if (!term || !text) return
    if (await copyText(text)) toast.success('Copied the selection.')
    else toast.error('Could not copy to the clipboard.')
    term.focus()
  }, [])

  return {
    containerRef,
    status,
    detail,
    connect,
    disconnect,
    hasSelection,
    copySelection,
    focus: () => termRef.current?.focus(),
  }
}
