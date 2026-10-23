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
