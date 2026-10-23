import { useEffect, useState } from 'react'

import type { LogParams } from '@/api/queries'
import type { PlatformEvent, SandboxLogLine, SandboxStreamEvent } from '@/gen/openshell'
import type { SandboxRef } from '@/lib/sandbox'

export type StreamStatus = 'connecting' | 'live' | 'unavailable' | 'error'

/** Lines kept in memory while following. */
const MAX_LINES = 5000

/** A platform event shown as a log line from source "event". */
export function eventToLine(e: PlatformEvent): SandboxLogLine {
  return {
    event_time: e.event_time,
    source: 'event',
    level: e.type === 'Warning' ? 'WARN' : 'INFO',
    target: e.reason,
    message: e.message,
    fields: e.metadata,
  }
}

function watchUrl(gw: string, ref: SandboxRef, p: LogParams) {
  const q = new URLSearchParams({
    workspace: ref.workspace,
    logs: '1',
    events: '1',
    tail: String(p.n ?? 500),
  })
  if (p.source && p.source !== 'all') q.set('source', p.source)
  if (p.level) q.set('level', p.level)
  if (p.since) q.set('since', p.since)
  return `/api/gw/${encodeURIComponent(gw)}/sandboxes/${encodeURIComponent(ref.name)}/watch?${q}`
}

/**
 * Follows a sandbox's logs and platform events over the backend's SSE watch
 * stream. Status "unavailable" means the backend has no watch endpoint (the
 * caller then polls instead).
 */
interface StreamState {
  /** The stream this state belongs to; a new stream starts from scratch. */
  key: string
  lines: SandboxLogLine[]
  status: StreamStatus
  error: string
}

const fresh = (key: string): StreamState => ({ key, lines: [], status: 'connecting', error: '' })

export function useLogStream(gw: string, ref: SandboxRef, params: LogParams, enabled: boolean) {
  const url = watchUrl(gw, ref, params)
  const key = enabled && gw && ref.name ? url : ''
  const [state, setState] = useState<StreamState>(() => fresh(key))

  useEffect(() => {
    if (!key) return
    // Updates for this stream only; state of an older stream is discarded.
    const update = (fn: (s: StreamState) => Partial<StreamState>) =>
      setState((prev) => {
        const base = prev.key === key ? prev : fresh(key)
        return { ...base, ...fn(base) }
      })
    let opened = false
    let buffer: SandboxLogLine[] = []
    const es = new EventSource(key)

    // Batch updates so a burst of lines renders once per frame.
    let frame = 0
    const flush = () => {
      frame = 0
      const batch = buffer
      buffer = []
      update((s) => {
        const next = s.lines.concat(batch)
        return { lines: next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next }
      })
    }

    es.onopen = () => {
      opened = true
      update(() => ({ status: 'live' }))
    }
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as SandboxStreamEvent
      const line = msg.log ?? (msg.event ? eventToLine(msg.event) : null)
      if (msg.warning?.message)
        buffer.push({ source: 'console', level: 'WARN', message: msg.warning.message })
      if (line) buffer.push(line)
      if (buffer.length && !frame) frame = requestAnimationFrame(flush)
    }
    es.addEventListener('error', (ev) => {
      if (ev instanceof MessageEvent && ev.data) {
        // The server reported a gRPC error and ended the stream; do not reconnect.
        es.close()
        let error = String(ev.data)
        try {
          error = (JSON.parse(ev.data) as { error?: string }).error ?? 'The stream failed.'
        } catch {
          // Not JSON: show the raw text.
        }
        update(() => ({ status: 'error', error }))
        return
      }
      if (!opened) {
        // Never connected: an older backend without /watch, or a bad request.
        es.close()
        update(() => ({ status: 'unavailable' }))
      } else {
        update(() => ({ status: 'connecting' })) // EventSource reconnects on its own.
      }
    })
    return () => {
      es.close()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key])

  const current = state.key === key ? state : fresh(key)
  return { lines: current.lines, status: current.status, error: current.error }
}
