import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useCallback, useEffect, useRef, useState } from 'react'

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

  // One xterm instance for the component's lifetime.
  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#e5e5e5' },
      scrollback: 5000,
      // When a program captures the mouse, Shift+drag (Option+drag on macOS)
      // still selects text for copying.
      macOptionClickForcesSelection: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current!)
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
    observer.observe(containerRef.current!)
    term.attachCustomKeyEventHandler((e) => {
      const action = clipboardAction(e, term.hasSelection())
      if (!action) return true
      e.preventDefault()
      if (action === 'copy') {
        const text = term.getSelection()
        if (text) void navigator.clipboard.writeText(text).then(() => term.clearSelection())
      } else {
        void navigator.clipboard.readText().then((text) => term.paste(text))
      }
      return false
    })
    const enc = new TextEncoder()
    const input = term.onData((s) => {
      const ws = socketRef.current
      if (ws?.readyState === WebSocket.OPEN) ws.send(enc.encode(s))
    })
    return () => {
      observer.disconnect()
      input.dispose()
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

  return {
    containerRef,
    status,
    detail,
    connect,
    disconnect,
    focus: () => termRef.current?.focus(),
  }
}
