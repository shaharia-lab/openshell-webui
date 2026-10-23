import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { resetServer, server } from './server'

// jsdom lacks these browser APIs.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView ??= () => {}

// Node's fetch needs absolute URLs; the app calls relative /api paths.
const nodeFetch = globalThis.fetch
globalThis.fetch = (input, init) =>
  nodeFetch(typeof input === 'string' ? new URL(input, window.location.origin) : input, init)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  resetServer()
  localStorage.clear()
})
afterAll(() => server.close())
