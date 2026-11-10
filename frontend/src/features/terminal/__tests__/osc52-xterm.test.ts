import { Terminal } from '@xterm/xterm'
import { expect, it } from 'vitest'

import { parseOsc52 } from '../osc52'

it('xterm hands OSC 52 (BEL or ST terminated) to the registered handler', async () => {
  const term = new Terminal({ allowProposedApi: false })
  const seen: (string | null)[] = []
  term.parser.registerOscHandler(52, (data) => {
    seen.push(parseOsc52(data))
    return true
  })
  await new Promise<void>((r) => term.write('\x1b]52;c;aGk=\x07\x1b]52;c;dGhlcmU=\x1b\\', r))
  expect(seen).toEqual(['hi', 'there'])
  term.dispose()
})
