import { expect, test } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { AnnotationRequestLane } = require('../scripts/electron-annotations/request.cjs')
const deferred = () => {
  let resolve!: (value?: unknown) => void
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}

test('successful result waits for actual cleanup and blocks replacement until settlement', async () => {
  const cleanup = deferred()
  const lane = new AnnotationRequestLane({ generation: () => 1, cleanup: () => cleanup.promise })
  const request = lane.begin({ request: 'first', generation: 1, timeoutMs: 5000 })
  expect(await lane.work('first', async () => 'captured-element')).toBe('captured-element')
  const result = lane.complete('first', { comment: 'Literal synthetic note' })
  expect(lane.status()).toEqual({ phase: 'finishing', request: 'first', generation: 1, pending: 0 })
  expect(() => lane.begin({ request: 'replacement', generation: 1, timeoutMs: 5000 })).toThrow('ANNOTATION_TARGET_BUSY')
  cleanup.resolve()
  expect(await result).toEqual({ comment: 'Literal synthetic note' })
  expect(await request.result).toEqual({ comment: 'Literal synthetic note' })
  expect(lane.status()).toEqual({ phase: 'idle', request: null, generation: 1, pending: 0 })
})

test('cancel revokes delivery but joins an already admitted file operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cnc-annotation-request-'))
  const commit = deferred(), started = deferred()
  const lane = new AnnotationRequestLane({ generation: () => 1, cleanup: async () => {} })
  const request = lane.begin({ request: 'capture', generation: 1, timeoutMs: 5000 })
  const outcome = request.result.catch((error: Error) => error.message)
  const operation = lane.work('capture', async () => {
    started.resolve()
    await commit.promise
    await writeFile(join(root, 'owned-evidence.txt'), 'COMMITTED_SYNTHETIC_EVIDENCE', { flag: 'wx', mode: 0o600 })
    return 'not-for-delivery'
  }).catch((error: Error) => error.message)
  await started.promise
  const cancellation = lane.cancel('capture')
  expect(lane.status()).toEqual({ phase: 'cancelling', request: 'capture', generation: 1, pending: 1 })
  expect(request.signal.aborted).toBe(true)
  expect(() => lane.begin({ request: 'replacement', generation: 1, timeoutMs: 5000 })).toThrow('ANNOTATION_TARGET_BUSY')
  commit.resolve()
  expect(await operation).toBe('ANNOTATION_REQUEST_REVOKED')
  expect(await cancellation).toEqual({ phase: 'cancelled' })
  expect(await outcome).toBe('ANNOTATION_CANCELLED')
  expect(await readFile(join(root, 'owned-evidence.txt'), 'utf8')).toBe('COMMITTED_SYNTHETIC_EVIDENCE')
  expect(lane.status().phase).toBe('idle')
})

test('a deadline does not release the lease while an actual operation remains pending', async () => {
  const finish = deferred(), started = deferred()
  const lane = new AnnotationRequestLane({ generation: () => 1, cleanup: async () => {} })
  const request = lane.begin({ request: 'delayed', generation: 1, timeoutMs: 25 })
  const outcome = request.result.catch((error: Error) => error.message)
  const operation = lane.work('delayed', async () => { started.resolve(); await finish.promise; return 'late' }).catch((error: Error) => error.message)
  await started.promise
  await expect.poll(() => lane.status().phase).toBe('cancelling')
  expect(lane.status().pending).toBe(1)
  expect(() => lane.complete('delayed', 'false-success')).toThrow('ANNOTATION_REQUEST_REVOKED')
  finish.resolve()
  expect(await operation).toBe('ANNOTATION_REQUEST_REVOKED')
  expect(await outcome).toBe('ANNOTATION_DEADLINE')
  expect(lane.status()).toEqual({ phase: 'idle', request: null, generation: 1, pending: 0 })
})

test('reload and target closure invalidate delivery without letting stale cancellation replace a new request', async () => {
  let generation = 1
  const lane = new AnnotationRequestLane({ generation: () => generation, cleanup: async () => {} })
  const first = lane.begin({ request: 'old-document', generation: 1, timeoutMs: 5000 })
  const outcome = first.result.catch((error: Error) => error.message)
  generation = 2
  expect(await lane.invalidate()).toEqual({ phase: 'cancelled' })
  expect(await outcome).toBe('ANNOTATION_STALE_GENERATION')
  expect(() => lane.begin({ request: 'wrong-generation', generation: 1, timeoutMs: 5000 })).toThrow('ANNOTATION_STALE_GENERATION')
  const second = lane.begin({ request: 'new-document', generation: 2, timeoutMs: 5000 })
  const secondOutcome = second.result.catch((error: Error) => error.message)
  expect(await lane.cancel('old-document')).toEqual({ phase: 'not-current' })
  expect(lane.status().phase).toBe('active')
  await lane.cancel('new-document', 'ANNOTATION_TARGET_CLOSED')
  expect(await secondOutcome).toBe('ANNOTATION_TARGET_CLOSED')
})

test('cleanup failure remains blocked rather than creating a replacement success', async () => {
  const lane = new AnnotationRequestLane({ generation: () => 1, cleanup: async () => { throw new Error('synthetic cleanup failure') } })
  const request = lane.begin({ request: 'retained', generation: 1, timeoutMs: 5000 })
  const outcome = request.result.catch((error: Error) => error.message)
  await expect(lane.complete('retained', { comment: 'Never delivered' })).rejects.toThrow('ANNOTATION_CLEANUP_UNCONFIRMED')
  expect(await outcome).toBe('ANNOTATION_CLEANUP_UNCONFIRMED')
  expect(lane.status()).toEqual({ phase: 'blocked', request: 'retained', generation: 1, pending: 0 })
  expect(() => lane.begin({ request: 'replacement', generation: 1, timeoutMs: 5000 })).toThrow('ANNOTATION_TARGET_BUSY')
})

for (const stage of ['private', 'prepare', 'activation']) test(`R1 cancellation owns and joins delayed ${stage}`, async () => {
  const { AnnotationController } = require('../scripts/electron-annotations/controller.cjs')
  const entered = deferred(), release = deferred(), activated = deferred()
  let released = false, active = false, stoppedBeforeRelease = false
  const controller = new AnnotationController({ window: { isDestroyed: () => false, webContents: { isDestroyed: () => false } },
    context: {}, generation: () => 1, target: 'target', session: 'session' })
  const hold = async (name: string) => { if (stage === name) { entered.resolve(); await release.promise } }
  controller.privateContent = () => hold('private')
  controller.prepare = () => hold('prepare')
  controller.world = async (code: string) => {
    if (code.includes('.start(')) { await hold('activation'); active = true; activated.resolve(); return { active: true } }
    if (code.includes('.stop()')) { stoppedBeforeRelease = !released; active = false; return { restored: true } }
    throw new Error('UNEXPECTED_WORLD_OPERATION')
  }
  const outcome = controller.start({ request: 'delayed-start', generation: 1, mode: 'none', timeoutMs: 5000 })
    .then(() => 'unexpected-success', (error: Error) => error.message)
  await entered.promise
  const during = controller.lane.status()
  const cancelled = controller.cancel({ cancelFor: 'delayed-start', generation: 1 })
  await Promise.resolve()
  released = true; release.resolve()
  await Promise.race([outcome, activated.promise])
  if (controller.lane.status().phase === 'active') await controller.cancel({ cancelFor: 'delayed-start', generation: 1 })
  const result = await outcome
  await cancelled
  expect({ during, result, active, stoppedBeforeRelease }).toEqual({
    during: { phase: 'active', request: 'delayed-start', generation: 1, pending: 1 },
    result: 'ANNOTATION_CANCELLED', active: false, stoppedBeforeRelease: false,
  })
})

test('R1 a preparation deadline retains ownership until preparation and cleanup settle', async () => {
  const { AnnotationController } = require('../scripts/electron-annotations/controller.cjs')
  const entered = deferred(), release = deferred()
  let active = false, settled = false
  const controller = new AnnotationController({ window: { isDestroyed: () => false, webContents: { isDestroyed: () => false } }, context: {}, generation: () => 1, target: 'target', session: 'session' })
  controller.privateContent = async () => { entered.resolve(); await release.promise }
  controller.prepare = async () => {}
  controller.world = async (code: string) => { if (code.includes('.start(')) active = true; else active = false; return { restored: true } }
  const outcome = controller.start({ request: 'preparation-deadline', generation: 1, mode: 'none', timeoutMs: 25 })
    .then(() => 'unexpected', (error: Error) => error.message).finally(() => { settled = true })
  await entered.promise
  try {
    await expect.poll(() => controller.lane.status().phase).toBe('cancelling')
    expect(settled).toBe(false)
    expect(controller.lane.status().pending).toBe(1)
  } finally { release.resolve() }
  expect(await outcome).toBe('ANNOTATION_DEADLINE')
  expect(active).toBe(false)
  expect(controller.lane.status().phase).toBe('idle')
})

test('R1 navigation during preparation joins departure without executing in the new document', async () => {
  const { AnnotationController } = require('../scripts/electron-annotations/controller.cjs')
  const { EventEmitter } = require('node:events')
  const entered = deferred(), release = deferred(), contents = new EventEmitter()
  contents.isDestroyed = () => false
  let generation = 1, worldCalls = 0
  const controller = new AnnotationController({ window: { isDestroyed: () => false, webContents: contents }, context: {}, generation: () => generation, target: 'target', session: 'session' })
  controller.privateContent = async () => {}
  controller.prepare = async () => { entered.resolve(); await release.promise }
  controller.world = async () => { worldCalls++; return { restored: true } }
  const outcome = controller.start({ request: 'navigation-preparation', generation: 1, mode: 'none', timeoutMs: 5000 })
    .then(() => 'unexpected', (error: Error) => error.message)
  await entered.promise
  generation = 2
  const retired = controller.retireNavigation()
  expect(controller.lane.status()).toEqual({ phase: 'cancelling', request: 'navigation-preparation', generation: 1, pending: 1 })
  contents.emit('did-navigate')
  release.resolve()
  await retired
  expect(await outcome).toBe('ANNOTATION_STALE_GENERATION')
  expect(worldCalls).toBe(0)
  expect(controller.lane.status().phase).toBe('idle')
})
