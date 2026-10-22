import { expect, test } from '@playwright/test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseBoot, parseOwner, parseRenderer, admitRenderer } = require('../scripts/electron-annotations/protocol.cjs')
const owner = { version: 1, kind: 'boot', session: 'synthetic-session', target: 'synthetic-target', token: 'a'.repeat(64), foreground: false }
const envelope = { version: 1, session: 'synthetic-session', target: 'synthetic-target', token: 'a'.repeat(64), request: 'request-one' }

test('private control admits one owner and strips authentication from internal commands', () => {
  expect(parseBoot(owner)).toEqual({ version: 1, kind: 'boot', session: 'synthetic-session', target: 'synthetic-target', token: 'a'.repeat(64), foreground: false })
  expect(parseOwner({ ...envelope, kind: 'status' }, owner)).toEqual({ kind: 'status', request: 'request-one' })
  expect(parseOwner({ ...envelope, kind: 'start', mode: 'none', generation: 1 }, owner)).toEqual({ kind: 'start', request: 'request-one', mode: 'none', generation: 1, timeoutMs: 300000 })
  expect(parseOwner({ ...envelope, kind: 'cancel', cancelFor: 'older-request', generation: 1 }, owner)).toEqual({ kind: 'cancel', request: 'request-one', cancelFor: 'older-request', generation: 1 })
  for (const patch of [{ token: 'b'.repeat(64) }, { session: 'other-pane' }, { target: 'other-window' }, { version: 2 }]) {
    expect(() => parseOwner({ ...envelope, kind: 'status', ...patch }, owner)).toThrow('ANNOTATION_OWNER_REFUSED')
  }
})

test('control schema refuses paths, evaluation, extra fields and unbounded requests', () => {
  expect(parseOwner({ ...envelope, kind: 'shutdown' }, owner)).toEqual({ kind: 'shutdown', request: 'request-one' })
  for (const packet of [
    { ...envelope, kind: 'status', path: '/private/owner' },
    { ...envelope, kind: 'evaluate' },
    { ...envelope, kind: 'start', mode: 'full', generation: 1 },
    { ...envelope, kind: 'start', mode: 'crop', generation: 0 },
    { ...envelope, kind: 'start', mode: 'crop', generation: 1, timeoutMs: 900001 },
    { ...envelope, kind: 'status', request: '../foreign' },
    { ...envelope, kind: 'status', extra: 'x'.repeat(17000) },
  ]) expect(() => parseOwner(packet, owner)).toThrow(/ANNOTATION_(PACKET_REFUSED|OPERATION_REFUSED|PAYLOAD_LIMIT)/)
})

test('renderer admission binds the exact live main frame and window, not only the URL', () => {
  const frame = { url: 'file:///synthetic/index.html' }
  const webContents = { mainFrame: frame, isDestroyed: () => false }
  const window = { webContents, isDestroyed: () => false }
  expect(admitRenderer({ sender: webContents, senderFrame: frame }, window, 'file:///synthetic/index.html')).toBe(true)
  expect(admitRenderer({ sender: {}, senderFrame: frame }, window, 'file:///synthetic/index.html')).toBe(false)
  expect(admitRenderer({ sender: webContents, senderFrame: { ...frame } }, window, 'file:///synthetic/index.html')).toBe(false)
  expect(admitRenderer({ sender: webContents, senderFrame: frame }, window, 'file:///other/index.html')).toBe(false)
  expect(admitRenderer({ sender: webContents, senderFrame: null }, window, frame.url)).toBe(false)
  expect(admitRenderer({ sender: webContents, senderFrame: frame }, { ...window, isDestroyed: () => true }, frame.url)).toBe(false)
})

test('renderer schema preserves a bounded literal note and refuses input values and fake image success', () => {
  const selection = { selector: 'body > button:nth-of-type(1)', tag: 'button', role: 'button', name: 'Settings', comment: 'Reduce the Settings button padding',
    bounds: { x: 10, y: 20, width: 80, height: 32 }, styles: { display: 'block', fontSize: '12px', paddingTop: '4px', paddingRight: '8px', paddingBottom: '4px', paddingLeft: '8px' } }
  const packet = { kind: 'complete', request: 'request-one', generation: 1, revision: 0, mode: 'none',
    viewport: { width: 1280, height: 900, dpr: 1, scrollX: 0, scrollY: 0 }, selections: [selection], images: [] }
  expect(parseRenderer(packet)).toEqual({ kind: 'complete', request: 'request-one', generation: 1, revision: 0, mode: 'none',
    viewport: { width: 1280, height: 900, dpr: 1, scrollX: 0, scrollY: 0 }, selections: [{ selector: 'body > button:nth-of-type(1)', tag: 'button', role: 'button', name: 'Settings', comment: 'Reduce the Settings button padding',
      bounds: { x: 10, y: 20, width: 80, height: 32 }, styles: { display: 'block', fontSize: '12px', paddingTop: '4px', paddingRight: '8px', paddingBottom: '4px', paddingLeft: '8px' } }], images: [] })
  expect(parseRenderer({ kind: 'status' })).toEqual({ kind: 'status' })
  const mixed = parseRenderer({ ...packet, mode: 'crop', selections: [{ ...selection, image: true }, { ...selection, selector: 'body > button:nth-of-type(2)', image: false }], images: [{ index: 1, dataUrl: 'image-payload' }] })
  expect(mixed.selections.map((item: { image: boolean }) => item.image)).toEqual([true, false])
  expect(mixed.images).toEqual([{ index: 1, dataUrl: 'image-payload' }])
  for (const bad of [
    { ...packet, selections: [{ ...selection, value: 'synthetic-private-input' }] },
    { ...packet, selections: [{ ...selection, comment: 'x'.repeat(4097) }] },
    { ...packet, mode: 'crop', images: [] },
    { ...packet, viewport: { ...packet.viewport, width: 9000 } },
    { ...packet, callback: 'execute-this' },
    ...['#SYNTHETIC_PRIVATE_SELECTOR', '.SYNTHETIC_PRIVATE_CLASS', 'button[title="SYNTHETIC_PRIVATE_ATTRIBUTE"]'].map(selector => ({ ...packet, selections: [{ ...selection, selector }] })),
    { ...packet, selections: [{ ...selection, image: 'yes' }] },
    { ...packet, mode: 'crop', selections: [{ ...selection, image: false }], images: [{ index: 1, dataUrl: 'not-approved' }] },
    { kind: 'capture', request: 'request-one', generation: 1, revision: 0, mode: 'none', viewport: packet.viewport },
  ]) expect(() => parseRenderer(bad)).toThrow('ANNOTATION_PACKET_REFUSED')
})
