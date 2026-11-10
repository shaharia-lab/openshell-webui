import { describe, expect, it } from 'vitest'

import { clipboardAction } from '../use-terminal'

const key = (k: string, init: KeyboardEventInit = {}, type = 'keydown') =>
  new KeyboardEvent(type, { key: k, ctrlKey: true, ...init })

describe('clipboardAction', () => {
  it('copies on Ctrl+C only while there is a selection', () => {
    expect(clipboardAction(key('c'), true)).toBe('copy')
    expect(clipboardAction(key('c'), false)).toBeNull()
  })

  it('copies and pastes on Ctrl+Shift+C/V', () => {
    expect(clipboardAction(key('C', { shiftKey: true }), false)).toBe('copy')
    expect(clipboardAction(key('V', { shiftKey: true }), false)).toBe('paste')
  })

  it('pastes on plain Ctrl+V except on macOS, where Ctrl+V stays ^V', () => {
    expect(clipboardAction(key('v'), false, false)).toBe('paste')
    expect(clipboardAction(key('v'), true, true)).toBeNull()
    expect(clipboardAction(key('V', { shiftKey: true }), false, true)).toBe('paste')
  })

  it('leaves other keys and key-up events to the terminal', () => {
    expect(clipboardAction(key('c', { ctrlKey: false }), true)).toBeNull()
    expect(clipboardAction(key('c', { altKey: true }), true)).toBeNull()
    expect(clipboardAction(key('c', {}, 'keyup'), true)).toBeNull()
  })
})
