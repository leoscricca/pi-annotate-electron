import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { decodeRequest, decodeReply, decodeEvent, encodePacket } = require('../scripts/electron-development-ui/protocol.cjs')
const owner = { session: 'pane-a', instance: 'app-a', window: 'window-1', connection: 'connection-a', generation: 3 }
const request = (action: string, params: Record<string, unknown> = {}) => ({
  version: 1, kind: 'request', request: 'request-1', action, params, binding: owner,
})
const reply = <T>(action: string, value: T) => ({
  version: 1, kind: 'reply', request: 'request-1', action, binding: owner, ok: true, value,
})
const wire = (value: unknown) => JSON.stringify(value)
const viewport = { width: 1280, height: 800, dpr: 1, scrollX: 0, scrollY: 0 }
const image = { path: '/private/fixture/capture.png', sha256: 'a'.repeat(64), width: 100, height: 40, bytes: 120, mime: 'image/png' }

test('normal UI text is literal and input needs no content classifier or approval field', () => {
  const value = decodeRequest(wire(request('fill', { ref: 'e3', revision: 7, text: 'const value = "/tmp/local"; Synthetic annotation draft' })), owner)
  expect(value).toEqual({ version: 1, kind: 'request', request: 'request-1', action: 'fill',
    binding: { session: 'pane-a', instance: 'app-a', window: 'window-1', connection: 'connection-a', generation: 3 },
    params: { ref: 'e3', revision: 7, text: 'const value = "/tmp/local"; Synthetic annotation draft' } })
  expect(decodeReply(wire(reply('fill', { outcome: 'dispatched' })), value).value).toEqual({ outcome: 'dispatched' })
  expect(() => decodeRequest(wire(request('fill', { ref: 'e3', revision: 7, text: 'x', approval: true })))).toThrow('DEV_UI_PACKET_REFUSED')
})

test('fixed UI operations admit their documented input and reject extra operation parameters', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['status', {}], ['snapshot', {}], ['screenshot', {}], ['screenshot', { ref: 'e1', revision: 1 }],
    ['click', { ref: 'e1', revision: 1, button: 'right', count: 2 }], ['scroll', { direction: 'down', amount: 400 }],
    ['scroll', { ref: 'e1', revision: 1, direction: 'left', amount: 50 }], ['key', { key: 'Control+A' }],
    ['console', { clear: true }], ['exceptions', {}], ['network', {}], ['annotate', { mode: 'none' }],
    ['cancel', { annotation: 'annotation-1' }], ['disconnect', {}],
  ]
  for (const [action, params] of cases) {
    expect(decodeRequest(wire(request(action, params)), owner).action).toBe(action)
    expect(() => decodeRequest(wire(request(action, { ...params, command: 'Runtime.evaluate' })), owner)).toThrow('DEV_UI_PACKET_REFUSED')
  }
  for (const action of ['evaluate', 'Runtime.evaluate', 'Node', 'shell', 'readFile', '__proto__', { toString: 'x' }]) {
    expect(() => decodeRequest(wire({ ...request('status'), action }))).toThrow('DEV_UI_PACKET_REFUSED')
  }
  for (const params of [{ ref: 'e1' }, { revision: 1 }, { ref: 'e1', revision: 0 }, { ref: '', revision: 1 }]) {
    expect(() => decodeRequest(wire(request('screenshot', params)))).toThrow('DEV_UI_PACKET_REFUSED')
  }
})

test('discovery and connection use separate closed envelopes and attached target identities', () => {
  const list = { version: 1, kind: 'request', request: 'list-1', action: 'list', params: {} }
  expect(decodeRequest(wire(list))).toEqual({ version: 1, kind: 'request', request: 'list-1', action: 'list', params: {} })
  const connect = { ...list, request: 'request-1', action: 'connect', params: { session: 'pane-a', instance: 'app-a', window: 'window-1', generation: 3 } }
  expect(decodeRequest(wire(connect)).params).toEqual({ session: 'pane-a', instance: 'app-a', window: 'window-1', generation: 3 })
  const target = { kind: 'attached-development', instance: 'app-a', window: 'window-1', generation: 3,
    label: 'CnC Mendix Agent development', capabilities: ['annotation', 'input'] }
  expect(decodeReply(wire(reply('connect', { state: 'connected-idle', target })), connect).value.target).toEqual({
    kind: 'attached-development', instance: 'app-a', window: 'window-1', generation: 3,
    label: 'CnC Mendix Agent development', capabilities: ['annotation', 'input'],
  })
  const listing = { version: 1, kind: 'reply', request: 'list-1', action: 'list', ok: true, value: { targets: [target] } }
  expect(decodeReply(wire(listing), list).value.targets[0].kind).toBe('attached-development')
  expect(() => decodeRequest(wire({ ...list, binding: owner }))).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeRequest(wire({ ...connect, params: { ...connect.params, path: '/private/other-app' } }))).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeReply(wire({ ...listing, value: { targets: [{ ...target, kind: 'owned-synthetic' }] } }), list)).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeReply(wire(reply('connect', { state: 'connected-idle', target: { ...target, window: 'other' } })), connect)).toThrow('DEV_UI_STALE_IDENTITY')
})

test('every ownership field rejects stale or cross-target requests, replies, and annotation events', () => {
  const command = request('status')
  expect(decodeReply(wire(reply('status', { state: 'connected-idle' })), command).value).toEqual({ state: 'connected-idle' })
  const event = { version: 1, kind: 'annotation', binding: owner, request: 'annotation-1', mode: 'none', outcome: 'submitted',
    notes: [{ comment: 'Keep this literal', selector: 'body > button:nth-child(1)', tag: 'button', name: 'Settings', rect: { x: 1, y: 2, width: 100, height: 40 } }] }
  expect(decodeEvent(wire(event), owner, 'annotation-1').notes[0].comment).toBe('Keep this literal')
  for (const key of ['session', 'instance', 'window', 'connection', 'generation']) {
    const other = { ...owner, [key]: key === 'generation' ? 4 : 'other' }
    expect(() => decodeRequest(wire({ ...command, binding: other }), owner)).toThrow('DEV_UI_STALE_IDENTITY')
    expect(() => decodeReply(wire({ ...reply('status', { state: 'connected-idle' }), binding: other }), command)).toThrow('DEV_UI_STALE_IDENTITY')
    expect(() => decodeEvent(wire({ ...event, binding: other }), owner, 'annotation-1')).toThrow('DEV_UI_STALE_IDENTITY')
  }
  expect(() => decodeReply(wire({ ...reply('status', { state: 'connected-idle' }), request: 'late' }), command)).toThrow('DEV_UI_CORRELATION_REFUSED')
  expect(() => decodeEvent(wire(event), owner, 'different-annotation')).toThrow('DEV_UI_CORRELATION_REFUSED')
})

test('snapshot and diagnostics results preserve actual UI content and report output limits', () => {
  const node = { ref: 'e1', depth: 0, tag: 'textarea', role: 'textbox', name: 'Developer draft', value: 'Synthetic annotation draft',
    focused: true, rect: { x: 40, y: 100, width: 200, height: 32 } }
  const result = reply('snapshot', { revision: 8, viewport, nodes: [node], truncated: false })
  expect(decodeReply(wire(result), request('snapshot')).value.nodes[0]).toEqual({ ref: 'e1', depth: 0, tag: 'textarea', role: 'textbox',
    name: 'Developer draft', value: 'Synthetic annotation draft', focused: true, rect: { x: 40, y: 100, width: 200, height: 32 } })
  const failure = { kind: 'network', message: 'net::ERR_FAILED', source: 'http://127.0.0.1:5173/missing.js?fixture=1', timestamp: 10, status: 404, resourceType: 'Script' }
  expect(decodeReply(wire(reply('network', { items: [failure], truncated: true })), request('network')).value).toEqual({
    items: [{ kind: 'network', message: 'net::ERR_FAILED', source: 'http://127.0.0.1:5173/missing.js?fixture=1', timestamp: 10, status: 404, resourceType: 'Script' }], truncated: true,
  })
  expect(() => decodeReply(wire(reply('network', { items: [{ ...failure, headers: {} }], truncated: false })), request('network'))).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeReply(wire(reply('console', { items: [failure], truncated: false })), request('console'))).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeReply(wire({ ...result, value: { ...result.value, nodes: Array.from({ length: 2001 }, (_, i) => ({ ...node, ref: `e${i}` })) } }), request('snapshot'))).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeReply(wire({ ...result, value: { ...result.value, nodes: [node, node] } }), request('snapshot'))).toThrow('DEV_UI_PACKET_REFUSED')
})

test('image metadata is bounded and a no-image annotation cannot carry an image', () => {
  expect(decodeReply(wire(reply('screenshot', { image, viewport })), request('screenshot')).value.image).toEqual({
    path: '/private/fixture/capture.png', sha256: 'a'.repeat(64), width: 100, height: 40, bytes: 120, mime: 'image/png',
  })
  const note = { comment: 'Reduce the Settings button padding', selector: 'body > button:nth-child(1)', tag: 'button', name: 'Settings',
    rect: { x: 1, y: 2, width: 100, height: 40 } }
  const event = { version: 1, kind: 'annotation', binding: owner, request: 'annotation-1', mode: 'none', outcome: 'submitted', notes: [note] }
  expect(decodeEvent(wire(event), owner, 'annotation-1').notes).toEqual([{ comment: 'Reduce the Settings button padding', selector: 'body > button:nth-child(1)',
    tag: 'button', name: 'Settings', rect: { x: 1, y: 2, width: 100, height: 40 } }])
  expect(() => decodeEvent(wire({ ...event, notes: [{ ...note, image }] }), owner, 'annotation-1')).toThrow('DEV_UI_PACKET_REFUSED')
  expect(decodeEvent(wire({ ...event, mode: 'crop', notes: [{ ...note, image }] }), owner, 'annotation-1').notes[0].image.width).toBe(100)
  expect(decodeEvent(wire({ ...event, outcome: 'cancelled', notes: [] }), owner, 'annotation-1').outcome).toBe('cancelled')
  expect(() => decodeReply(wire(reply('screenshot', { image: { ...image, width: 8192, height: 8192 }, viewport })), request('screenshot'))).toThrow('DEV_UI_PAYLOAD_LIMIT')
  expect(() => decodeReply(wire(reply('screenshot', { image: { ...image, bytes: 10_485_761 }, viewport })), request('screenshot'))).toThrow('DEV_UI_PACKET_REFUSED')
})

test('picker readiness, diagnostics, cancellation and revocation retain explicit typed outcomes', () => {
  expect(decodeReply(wire(reply('annotate', { state: 'picker-active', annotation: 'request-1', mode: 'none' })), request('annotate', { mode: 'none' })).value)
    .toEqual({ state: 'picker-active', annotation: 'request-1', mode: 'none' })
  expect(() => decodeReply(wire(reply('annotate', { state: 'picker-active', annotation: 'late', mode: 'none' })), request('annotate', { mode: 'none' })))
    .toThrow('DEV_UI_CORRELATION_REFUSED')
  expect(decodeReply(wire(reply('cancel', { state: 'connected-idle' })), request('cancel', { annotation: 'request-1' })).value)
    .toEqual({ state: 'connected-idle' })
  expect(decodeReply(wire(reply('disconnect', { state: 'disconnected' })), request('disconnect')).value).toEqual({ state: 'disconnected' })
  for (const [action, kind] of [['console', 'console'], ['exceptions', 'exception']]) {
    expect(decodeReply(wire(reply(action, { items: [{ kind, message: 'Synthetic UI failure', timestamp: 20 }], truncated: false })), request(action)).value.items[0].message)
      .toBe('Synthetic UI failure')
  }
  expect(decodeEvent(wire({ version: 1, kind: 'revoked', binding: owner, reason: 'DOCUMENT_RELOADED' }), owner).reason).toBe('DOCUMENT_RELOADED')
})

test('wire byte caps apply before JSON parsing and framing preserves a real request', () => {
  const command = request('status'); const json = wire(command)
  const exact = json + ' '.repeat(16_384 - Buffer.byteLength(json))
  expect(decodeRequest(Buffer.from(exact), owner).action).toBe('status')
  expect(() => decodeRequest(Buffer.from(exact + ' '))).toThrow('DEV_UI_PAYLOAD_LIMIT')
  expect(() => decodeRequest(Buffer.alloc(16_385, 0xff))).toThrow('DEV_UI_PAYLOAD_LIMIT')
  expect(() => decodeRequest(Buffer.from([0xff]))).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeRequest('{bad json')).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeRequest('[]')).toThrow('DEV_UI_PACKET_REFUSED')
  expect(encodePacket(command)).toBe('{"version":1,"kind":"request","request":"request-1","action":"status","params":{},"binding":{"session":"pane-a","instance":"app-a","window":"window-1","connection":"connection-a","generation":3}}\n')
  const result = reply('status', { state: 'connected-idle' }); const resultJson = wire(result)
  expect(decodeReply(resultJson + ' '.repeat(2_097_152 - Buffer.byteLength(resultJson)), command).value).toEqual({ state: 'connected-idle' })
  expect(() => decodeReply(resultJson + ' '.repeat(2_097_153 - Buffer.byteLength(resultJson)), command)).toThrow('DEV_UI_PAYLOAD_LIMIT')
})

test('reply errors distinguish unknown mutation outcome from refusal and never claim completion', () => {
  const command = request('click', { ref: 'e1', revision: 1 })
  const value = { version: 1, kind: 'reply', request: 'request-1', action: 'click', binding: owner, ok: false,
    error: { code: 'TIMEOUT', message: 'Input outcome is unknown. Inspect before retry.', outcome: 'unknown' } }
  expect(decodeReply(wire(value), command).error).toEqual({
    code: 'TIMEOUT', message: 'Input outcome is unknown. Inspect before retry.', outcome: 'unknown',
  })
  expect(() => decodeReply(wire({ ...value, value: { outcome: 'observed' } }), command)).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeReply(wire({ ...value, error: { ...value.error, outcome: 'success' } }), command)).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeReply(wire(reply('disconnect', { state: 'connected-idle' })), request('disconnect'))).toThrow('DEV_UI_PACKET_REFUSED')
})


test('terminal cleanup receipts have a closed envelope and match every ownership field', () => {
  const event = { version: 1, kind: 'cleanup-complete', binding: owner }
  expect(decodeEvent(wire(event), owner)).toEqual({ version: 1, kind: 'cleanup-complete',
    binding: { session: 'pane-a', instance: 'app-a', window: 'window-1', connection: 'connection-a', generation: 3 } })
  for (const key of ['session', 'instance', 'window', 'connection', 'generation']) {
    expect(() => decodeEvent(wire({ ...event, binding: { ...owner, [key]: key === 'generation' ? 4 : 'other' } }), owner))
      .toThrow('DEV_UI_STALE_IDENTITY')
  }
  for (const extra of [{ reason: 'WINDOW_CLOSING' }, { success: true }, { notes: [] }, { request: 'annotation-1' }]) {
    expect(() => decodeEvent(wire({ ...event, ...extra }), owner)).toThrow('DEV_UI_PACKET_REFUSED')
  }
  expect(() => decodeEvent(wire({ ...event, version: 2 }), owner)).toThrow('DEV_UI_PACKET_REFUSED')
  expect(() => decodeRequest(wire(event), owner)).toThrow('DEV_UI_PACKET_REFUSED')
})
