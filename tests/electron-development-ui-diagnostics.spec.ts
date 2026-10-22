import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'

const require = createRequire(import.meta.url)
const { startDiagnostics } = require('../scripts/electron-development-ui/diagnostics.cjs')
function transport() {
  const frontend = Object.assign(new EventEmitter(), { sendCommand: async (_method: string) => ({}) })
  function emit(method: string, params: unknown) { frontend.emit('message', {}, method, params) }
  return { frontend, emit }
}

test('diagnostics preserve source facts but never project network headers, cookies or bodies', async () => {
  const f = transport(); const diagnostics = await startDiagnostics(f.frontend, () => true)
  try {
    f.emit('Runtime.consoleAPICalled', { type: 'error', timestamp: Date.now(), args: [{ value: 'Literal console error /tmp/visible.js' }, { value: null }, { value: false }, { value: 0 }],
      stackTrace: { callFrames: [{ url: 'cnc-console.js', lineNumber: 3, columnNumber: 6 }] } })
    f.emit('Runtime.exceptionThrown', { timestamp: Date.now(), exceptionDetails: { text: 'Uncaught', exception: { description: 'Error: fixture exception' },
      stackTrace: { callFrames: [{ url: 'cnc-exception.js', lineNumber: 8, columnNumber: 2 }] } } })
    f.emit('Network.requestWillBeSent', { requestId: 'request1', wallTime: Date.now() / 1000 + 1, type: 'Fetch',
      request: { url: 'https://fixture.invalid/failed', headers: { Authorization: 'discarded-header', Cookie: 'discarded-cookie' }, postData: 'discarded-body' } })
    f.emit('Network.responseReceived', { requestId: 'request1', response: { status: 503, headers: { 'Set-Cookie': 'discarded-response-cookie' }, body: 'discarded-response-body' } })
    expect(diagnostics.read('console')).toEqual({ truncated: false, items: [{ kind: 'console', message: 'Literal console error /tmp/visible.js null false 0',
      timestamp: expect.any(Number), source: 'cnc-console.js', line: 4, column: 7 }] })
    expect(diagnostics.read('exception')).toEqual({ truncated: false, items: [{ kind: 'exception', message: 'Error: fixture exception',
      stack: 'Error: fixture exception', timestamp: expect.any(Number), source: 'cnc-exception.js', line: 9, column: 3 }] })
    const network = diagnostics.read('network')
    expect(network).toEqual({ truncated: false, items: [{ kind: 'network', message: 'HTTP 503 https://fixture.invalid/failed',
      timestamp: expect.any(Number), source: 'https://fixture.invalid/failed', status: 503, resourceType: 'Fetch' }] })
    expect(JSON.stringify(network)).not.toContain('discarded-')
  } finally { diagnostics.stop() }
})

test('bounded buffers, explicit clear, retired documents and stopped collectors preserve their actual outcomes', async () => {
  const f = transport(); let current = true
  const diagnostics = await startDiagnostics(f.frontend, () => current)
  try {
    for (let index = 0; index < 205; index += 1) f.emit('Runtime.consoleAPICalled', { type: 'error', timestamp: Date.now(), args: [{ value: `error${index}` }] })
    const result = diagnostics.read('console', true)
    expect(result.truncated).toBe(true); expect(result.items).toHaveLength(200)
    expect(result.items[0].message).toBe('error5'); expect(result.items[199].message).toBe('error204')
    expect(diagnostics.read('console')).toEqual({ items: [], truncated: false })
    current = false
    f.emit('Runtime.consoleAPICalled', { type: 'error', timestamp: Date.now(), args: [{ value: 'retired document' }] })
    expect(diagnostics.read('console')).toEqual({ items: [], truncated: false })
  } finally { diagnostics.stop() }
  expect(f.frontend.listenerCount('message')).toBe(0)
  f.emit('Runtime.consoleAPICalled', { type: 'error', timestamp: Date.now(), args: [{ value: 'after stop' }] })
  expect(diagnostics.read('console')).toEqual({ items: [], truncated: false })
})

test('browser policy failures remain console facts without an invented network request', async () => {
  const f = transport(); const diagnostics = await startDiagnostics(f.frontend, () => true)
  try {
    f.emit('Log.entryAdded', { entry: { level: 'error', source: 'security', timestamp: Date.now(),
      text: "Connecting to 'https://fixture.invalid/' violates Content Security Policy." } })
    expect(diagnostics.read('console')).toEqual({ truncated: false, items: [{ kind: 'console', timestamp: expect.any(Number),
      message: "Connecting to 'https://fixture.invalid/' violates Content Security Policy." }] })
    expect(diagnostics.read('network')).toEqual({ items: [], truncated: false })
  } finally { diagnostics.stop() }
})

test('failed collector setup removes its event ownership before it rejects', async () => {
  const f = transport()
  f.frontend.sendCommand = async () => { throw new Error('Synthetic protocol setup failure') }
  await expect(startDiagnostics(f.frontend, () => true)).rejects.toThrow('Synthetic protocol setup failure')
  expect(f.frontend.listenerCount('message')).toBe(0)
})
