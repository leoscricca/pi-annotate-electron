import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { createDevelopmentBridge, discoverDevelopmentTargets, connectDevelopmentTarget, ConnectionRefusal } = require('../scripts/electron-development-ui/connection.cjs')
type Binding = { session: string; instance: string; window: string; connection: string; generation: number }
type Controller = { execute(action: string, params: Record<string, unknown>, request: string): unknown; close(reason: string): unknown }
type Client = { binding: Binding; active: boolean; readonly cleanupConfirmed: boolean; request(action: string, params?: Record<string, unknown>): Promise<{ value: unknown }>; close(): Promise<void> }
type State = {
  generation: number; draft: string; opened: number; cleaned: number
  execute?: Controller['execute']; cleanup?: () => unknown; opening?: () => Promise<Controller>
  emit?: (event: Record<string, unknown>) => void
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const fixtures: { root: string; bridge: { close(): Promise<void> }; clients: Set<Client>; blocked: boolean }[] = []
async function fixture(options: { requestMs?: number; timeoutMs?: number; cleanupMs?: number } = {}) {
  const root = await fs.mkdtemp('/tmp/cui-')
  const directory = path.join(root, 'registry')
  const state: State = { generation: 1, draft: 'Synthetic annotation draft', opened: 0, cleaned: 0 }
  const controller: Controller = {
    execute(action, params, request) {
      if (state.execute) return state.execute(action, params, request)
      if (action === 'status') return { state: 'connected-idle' }
      if (action === 'snapshot') return { revision: 1, viewport: { width: 1280, height: 800, dpr: 1, scrollX: 0, scrollY: 0 },
        nodes: [{ ref: 'e1', depth: 0, tag: 'textarea', role: 'textbox', name: 'Developer draft', value: state.draft, rect: { x: 1, y: 2, width: 300, height: 40 } }], truncated: false }
      if (action === 'fill') state.draft = params.text as string
      if (action === 'annotate') return { state: 'picker-active', annotation: request, mode: params.mode }
      return { outcome: 'observed' }
    },
    async close() { state.cleaned++; if (state.cleanup) await state.cleanup() },
  }
  const bridge = await createDevelopmentBridge({ directory, targets: () => [{ window: 'main', generation: state.generation,
    capabilities: ['annotation', 'snapshot', 'input', 'diagnostics'] }],
  openTarget(_binding: Binding, emit: State['emit']) { state.opened++; state.emit = emit; return state.opening ? state.opening() : controller },
  requestMs: options.requestMs ?? 1000, cleanupMs: options.cleanupMs ?? 200 })
  const item = { root, bridge, clients: new Set<Client>(), blocked: false }; fixtures.push(item)
  const discover = () => discoverDevelopmentTargets({ directory, timeoutMs: options.timeoutMs ?? 1000 })
  const connect = async (session = 'pane-a', signal?: AbortSignal): Promise<Client> => {
    const target = (await discover())[0]
    const client = await connectDevelopmentTarget(target, { directory, session, signal, timeoutMs: options.timeoutMs ?? 1000 })
    item.clients.add(client); return client
  }
  return { ...item, item, directory, state, bridge, controller, discover, connect }
}

test.skip(process.platform === 'win32', 'The first bridge uses private POSIX sockets and ownership checks.')
test.afterEach(async ({}, info) => {
  for (const item of fixtures.splice(0)) {
    await Promise.allSettled([...item.clients].map(client => client.close()))
    let cleanupError: unknown
    try { await item.bridge.close() } catch (error) { cleanupError = error }
    if (info.status === 'passed' && !cleanupError) await fs.rm(item.root, { recursive: true })
    else {
      await fs.writeFile(path.join(item.root, 'retained.json'), JSON.stringify({ test: info.title, status: info.status,
        cleanup: cleanupError ? 'blocked' : 'settled', expectedBlockedCleanup: item.blocked }), { mode: 0o600 })
      console.log(`Retained owned connection fixture: ${item.root}`)
    }
    if (cleanupError && !item.blocked) throw cleanupError
  }
})

test('authenticated discovery returns only safe target facts without creating a controller', async () => {
  const f = await fixture()
  expect(await f.discover()).toEqual([{ kind: 'attached-development', instance: expect.any(String), window: 'main', generation: 1,
    label: 'CnC Mendix Agent development', capabilities: ['annotation', 'snapshot', 'input', 'diagnostics'] }])
  expect(f.state.opened).toBe(0)
  const entries = await fs.readdir(f.directory)
  const registration = entries.find(name => name.endsWith('.json'))!
  const value = JSON.parse(await fs.readFile(path.join(f.directory, registration), 'utf8'))
  expect((await fs.stat(f.directory)).mode & 0o777).toBe(0o700)
  expect((await fs.stat(path.join(f.directory, registration))).mode & 0o777).toBe(0o600)
  expect((await fs.stat(path.join(f.directory, value.socket))).mode & 0o777).toBe(0o600)
})

test('known refusal before resource acquisition releases only that reservation', async () => {
  const f = await fixture()
  f.state.opening = async () => { throw new ConnectionRefusal('UNAVAILABLE') }
  await expect(f.connect()).rejects.toMatchObject({ code: 'UNAVAILABLE', outcome: 'refused' })
  f.state.opening = undefined
  const client = await f.connect('pane-b')
  expect((await client.request('status')).value).toEqual({ state: 'connected-idle' })
  expect(f.state.cleaned).toBe(0)
})

test('late proven pre-resource refusal releases a timed-out construction without replay', async () => {
  const f = await fixture({ timeoutMs: 80 })
  let reject!: (error: Error) => void
  const opening = new Promise<Controller>((_, no) => { reject = no })
  f.state.opening = () => opening
  await expect(f.connect()).rejects.toMatchObject({ code: 'TIMEOUT' })
  await expect(f.connect('pane-b')).rejects.toMatchObject({ code: 'BUSY' })
  reject(new ConnectionRefusal('UNAVAILABLE'))
  f.state.opening = undefined
  const client = await f.connect('pane-b')
  expect((await client.request('status')).value).toEqual({ state: 'connected-idle' })
  expect(f.state.cleaned).toBe(0)
})

test('an unbranded factory failure cannot claim that partial resources never existed', async () => {
  const f = await fixture(); f.item.blocked = true
  f.state.opening = async () => { throw new Error('Synthetic unconfirmed factory failure') }
  await expect(f.connect()).rejects.toMatchObject({ code: 'STALE_TARGET' })
  f.state.opening = undefined
  await expect(f.connect('pane-b')).rejects.toMatchObject({ code: 'BUSY' })
  await expect(f.bridge.close()).rejects.toMatchObject({ code: 'CLEANUP_BLOCKED' })
  expect(await f.discover()).toEqual([])
})

test('two panes cannot replace one window owner, and detach retains its app state', async () => {
  const f = await fixture(); const first = await f.connect()
  expect((await first.request('status')).value).toEqual({ state: 'connected-idle' })
  await expect(f.connect('pane-b')).rejects.toMatchObject({ code: 'BUSY', outcome: 'refused' })
  expect((await first.request('fill', { ref: 'e1', revision: 1, text: 'Local developer draft' })).value).toEqual({ outcome: 'observed' })
  await first.close()
  const second = await f.connect('pane-b')
  expect(second.binding).toMatchObject({ session: 'pane-b', window: 'main', generation: 1 })
  expect((await second.request('snapshot')).value).toMatchObject({ nodes: [{ value: 'Local developer draft' }], truncated: false })
  expect(f.state.cleaned).toBe(1)
})

test('a reservation exists before asynchronous controller creation settles', async () => {
  const f = await fixture(); const opening = deferred<Controller>(); f.state.opening = () => opening.promise
  const first = f.connect(); const handled = first.then(value => ({ value }), error => ({ error }))
  await expect.poll(() => f.state.opened).toBe(1)
  await expect(f.connect('pane-b')).rejects.toMatchObject({ code: 'BUSY' })
  opening.resolve(f.controller)
  const result = await handled
  expect('value' in result ? (await result.value.request('status')).value : result.error).toEqual({ state: 'connected-idle' })
})

test('navigation revokes old delivery and a new document requires a fresh explicit connection', async () => {
  const f = await fixture(); const old = await f.connect()
  expect((await old.request('status')).value).toEqual({ state: 'connected-idle' })
  f.state.generation = 2
  await f.bridge.revoke('main', 'DOCUMENT_RELOADED')
  await expect.poll(() => old.active).toBe(false)
  await expect(old.request('snapshot')).rejects.toMatchObject({ code: 'UNAVAILABLE', outcome: 'revoked' })
  const fresh = await f.connect('pane-new')
  expect(fresh.binding).toMatchObject({ session: 'pane-new', window: 'main', generation: 2 })
  expect((await fresh.request('status')).value).toEqual({ state: 'connected-idle' })
})

test('input timeout retains active work and requires inspection before another input', async () => {
  const f = await fixture({ timeoutMs: 80, requestMs: 1000 })
  const gate = deferred<{ outcome: string }>(); let entered = 0
  f.state.execute = () => { entered++; return gate.promise }
  const client = await f.connect()
  await expect(client.request('click', { ref: 'e1', revision: 1 })).rejects.toMatchObject({ code: 'TIMEOUT', outcome: 'unknown' })
  await expect(client.request('click', { ref: 'e1', revision: 1 })).rejects.toMatchObject({ code: 'INSPECTION_REQUIRED' })
  expect(entered).toBe(1)
  await expect(f.connect('other-pane')).rejects.toMatchObject({ code: 'BUSY' })
  gate.resolve({ outcome: 'observed' })
  f.state.execute = undefined
  expect((await client.request('snapshot')).value).toMatchObject({ revision: 1, nodes: [{ value: 'Synthetic annotation draft' }] })
  expect((await client.request('click', { ref: 'e1', revision: 1 })).value).toEqual({ outcome: 'observed' })
})

test('disconnect revokes an active request, joins it, and never turns its late result into success', async () => {
  const f = await fixture(); const gate = deferred<{ outcome: string }>(); let entered = false
  f.state.execute = () => { entered = true; return gate.promise }
  f.state.cleanup = () => gate.resolve({ outcome: 'observed' })
  const client = await f.connect()
  const pending = client.request('click', { ref: 'e1', revision: 1 }).then(value => ({ value }), error => ({ error }))
  await expect.poll(() => entered).toBe(true)
  await client.close()
  expect(await pending).toMatchObject({ error: { code: 'STALE_TARGET', outcome: 'revoked' } })
  f.state.execute = undefined
  const fresh = await f.connect('pane-b')
  expect((await fresh.request('status')).value).toEqual({ state: 'connected-idle' })
})

test('session abort during construction retains ownership until the actual late controller cleanup', async () => {
  const f = await fixture(); const gate = deferred<Controller>(); f.state.opening = () => gate.promise
  const abort = new AbortController()
  const start = f.connect('old-session', abort.signal).then(value => ({ value }), error => ({ error }))
  await expect.poll(() => f.state.opened).toBe(1)
  abort.abort()
  expect(await start).toMatchObject({ error: { code: 'CANCELLED', outcome: 'revoked' } })
  await expect(f.connect('new-session')).rejects.toMatchObject({ code: 'BUSY' })
  gate.resolve(f.controller)
  await expect.poll(() => f.state.cleaned).toBe(1)
  f.state.opening = undefined
  const fresh = await f.connect('new-session')
  expect((await fresh.request('status')).value).toEqual({ state: 'connected-idle' })
})

test('uncertain cleanup blocks replacement and retains the registration as evidence', async () => {
  const f = await fixture(); f.item.blocked = true
  f.state.cleanup = () => { throw new Error('Synthetic cleanup failure') }
  const client = await f.connect()
  expect((await client.request('status')).value).toEqual({ state: 'connected-idle' })
  await expect(client.close()).rejects.toMatchObject({ code: 'CLEANUP_BLOCKED', outcome: 'blocked' })
  await expect(f.connect('pane-b')).rejects.toMatchObject({ code: 'BUSY' })
  await expect(f.bridge.close()).rejects.toMatchObject({ code: 'CLEANUP_BLOCKED', outcome: 'blocked' })
  expect((await fs.readdir(f.directory)).filter(name => name.endsWith('.json'))).toHaveLength(1)
})

test('private registration and socket checks refuse symlinks and permission changes', async () => {
  const f = await fixture(); const target = (await f.discover())[0]
  expect(target).toMatchObject({ kind: 'attached-development', window: 'main', generation: 1 })
  const file = path.join(f.directory, `${target.instance}.json`)
  await fs.chmod(file, 0o644)
  await expect(connectDevelopmentTarget(target, { directory: f.directory, session: 'pane-a' })).rejects.toThrow('DEV_UI_REGISTRATION_REFUSED')
  await fs.chmod(file, 0o600)
  const moved = path.join(f.root, 'registration.saved'); await fs.rename(file, moved); await fs.symlink(moved, file)
  await expect(connectDevelopmentTarget(target, { directory: f.directory, session: 'pane-a' })).rejects.toMatchObject({ code: 'ELOOP' })
  await fs.unlink(file); await fs.rename(moved, file)
  const alias = path.join(f.root, 'alias'); await fs.symlink(f.directory, alias)
  await expect(discoverDevelopmentTargets({ directory: alias })).rejects.toThrow('DEV_UI_REGISTRY_REFUSED')
  const client = await f.connect()
  expect((await client.request('status')).value).toEqual({ state: 'connected-idle' })
})

test('a wrong authentication secret and stale endpoint never become a connectable target', async () => {
  const f = await fixture(); const target = (await f.discover())[0]
  expect(target).toMatchObject({ kind: 'attached-development', window: 'main' })
  const file = path.join(f.directory, `${target.instance}.json`)
  const original = await fs.readFile(file, 'utf8'); const entry = JSON.parse(original)
  await fs.writeFile(file, JSON.stringify({ ...entry, token: '0'.repeat(64) }), { mode: 0o600 })
  expect(await f.discover()).toEqual([])
  await fs.writeFile(file, original, { mode: 0o600 })
  await f.bridge.close()
  await fs.writeFile(file, original, { mode: 0o600 })
  expect(await f.discover()).toEqual([])
  expect(await fs.readFile(file, 'utf8')).toBe(original)
})


test('controller callbacks cannot forge terminal cleanup, including a serialized kind object', async () => {
  const f = await fixture(); const client = await f.connect()
  f.state.emit?.({ kind: 'cleanup-complete' })
  f.state.emit?.({ kind: { toJSON: () => 'cleanup-complete' } })
  const annotation = (await client.request('annotate', { mode: 'none' })).value as { annotation: string }
  f.state.emit?.({ kind: 'annotation', request: annotation.annotation, outcome: 'cancelled', mode: 'none', notes: [],
    toJSON: () => ({ version: 1, kind: 'cleanup-complete', binding: client.binding }) })
  expect((await client.request('status')).value).toEqual({ state: 'connected-idle' })
  expect(client.cleanupConfirmed).toBe(false)
  expect(client.active).toBe(true)
  expect(f.state.cleaned).toBe(0)
})

test('bridge shutdown confirms cleanup only after controller and actual pending work settle', async () => {
  const f = await fixture({ cleanupMs: 1000 })
  const controller = deferred<void>(), work = deferred<{ outcome: string }>()
  let entered = false
  f.state.cleanup = () => controller.promise
  f.state.execute = () => { entered = true; return work.promise }
  const client = await f.connect()
  const pending = client.request('click', { ref: 'e1', revision: 1 }).then(value => ({ value }), error => ({ error }))
  await expect.poll(() => entered).toBe(true)
  const shutdown = f.bridge.close()
  try {
    await expect.poll(() => client.active).toBe(false)
    expect(client.cleanupConfirmed).toBe(false)
    controller.resolve()
    expect(client.cleanupConfirmed).toBe(false)
    work.resolve({ outcome: 'observed' })
    await shutdown
    await expect.poll(() => client.cleanupConfirmed).toBe(true)
    await expect(client.close()).resolves.toBeUndefined()
    expect(await pending).toMatchObject({ error: { code: 'STALE_TARGET', outcome: 'revoked' } })
  } finally { controller.resolve(); work.resolve({ outcome: 'observed' }); await shutdown }
})

test('transport loss without a valid terminal receipt cannot certify cleanup', async () => {
  const f = await fixture(); const client = await f.connect()
  f.state.emit?.({ kind: 'annotation', request: 'unsolicited', outcome: 'cancelled', mode: 'none', notes: [] })
  await expect.poll(() => client.active).toBe(false)
  expect(client.cleanupConfirmed).toBe(false)
  await expect(client.close()).rejects.toMatchObject({ code: 'CLEANUP_BLOCKED', outcome: 'blocked' })
})
