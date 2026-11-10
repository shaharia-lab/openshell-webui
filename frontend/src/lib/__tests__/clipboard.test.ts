import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText } from '../clipboard'

/** Makes document.execCommand('copy') fire a copy event, as browsers do. */
function stubExecCommand(result = true) {
  const data = new Map<string, string>()
  const exec = vi.fn((cmd: string) => {
    if (cmd !== 'copy') return false
    const event = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', {
      value: { setData: (type: string, v: string) => data.set(type, v) },
    })
    document.body.dispatchEvent(event)
    return result
  })
  document.execCommand = exec
  return { exec, data }
}

function stubClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

describe('copyText', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    stubClipboard()
  })

  it('copies through the copy event, without the Clipboard API', async () => {
    stubClipboard()
    const { data } = stubExecCommand()
    expect(await copyText('hello')).toBe(true)
    expect(data.get('text/plain')).toBe('hello')
  })

  it('keeps other copy listeners (xterm) from overwriting the text', async () => {
    stubClipboard()
    const { data } = stubExecCommand()
    const other = vi.fn()
    document.body.addEventListener('copy', other)
    await copyText('mine')
    document.body.removeEventListener('copy', other)
    expect(other).not.toHaveBeenCalled()
    expect(data.get('text/plain')).toBe('mine')
  })

  it('falls back to the Clipboard API when the copy command fails', async () => {
    stubExecCommand(false)
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard(writeText)
    expect(await copyText('x')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('x')
  })

  it('reports failure when neither way works', async () => {
    stubExecCommand(false)
    stubClipboard(() => Promise.reject(new Error('denied')))
    expect(await copyText('x')).toBe(false)
    stubClipboard()
    expect(await copyText('x')).toBe(false)
  })
})
