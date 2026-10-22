import { test, expect } from '@playwright/test'
import { rejects } from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture() {
  const ready = deferred<void>(), acquire = deferred<any>(), cleanup = deferred<void>()
  class App extends EventEmitter {
    isPackaged = false
    quits = 0
    whenReady() { return ready.promise }
    setName() {}
    setAppPath() {}
    quit() { this.quits++ }
  }
  const app = new App()
  let installations = 0, closes = 0, close: Promise<void> | undefined
  const logs: string[] = []
  const host = { registerWindow() {}, close() { if (!close) { closes++; close = cleanup.promise } return close } }
  const exported = { exports: {} as { startExternalApp: (config: unknown) => { ready: Promise<void> } } }
  const file = path.resolve('scripts/electron-development-ui/external-bootstrap.cjs')
  vm.runInNewContext(readFileSync(file, 'utf8'), {
    module: exported, __dirname: path.dirname(file), console: { error: (value: string) => logs.push(value) },
    require: (name: string) => name === 'electron' ? { app, ipcMain: {}, session: {} }
      : name === './host.cjs' ? { installDevelopmentUi: () => { installations++; return acquire.promise } } : require(name),
  }, { filename: file })
  const owned = exported.exports.startExternalApp({ name: 'Synthetic launch', appRoot: '/synthetic-app',
    entry: '/synthetic-app/main.mjs', renderer: '/synthetic-app/index.html' })
  // Observe rejection immediately, before a controlled gate can reject it.
  void owned.ready.catch(() => {})
  let prevented = 0
  const quit = () => app.emit('before-quit', { preventDefault() { prevented++ } })
  return { app, ready, acquire, cleanup, host, owned, quit, logs,
    counts: () => ({ installations, closes, prevented, quits: app.quits }) }
}

test('quit before readiness cannot start the app or acquire a bridge later', async () => {
  const f = fixture()
  f.quit()
  f.ready.resolve()
  await rejects(f.owned.ready, { code: 'EXTERNAL_STARTUP_CANCELLED' })
  await expect.poll(() => f.counts()).toEqual({ installations: 0, closes: 0, prevented: 1, quits: 1 })
  expect(f.app.listenerCount('browser-window-created')).toBe(0)
})

test('quit during bridge acquisition joins actual cleanup before normal quit', async () => {
  const f = fixture()
  f.ready.resolve()
  await expect.poll(() => f.counts().installations).toBe(1)
  f.quit()
  f.acquire.resolve(f.host)
  await rejects(f.owned.ready, { code: 'EXTERNAL_STARTUP_CANCELLED' })
  await expect.poll(() => f.counts().closes).toBe(1)
  f.quit()
  expect(f.counts()).toEqual({ installations: 1, closes: 1, prevented: 2, quits: 0 })
  expect(f.app.listenerCount('browser-window-created')).toBe(0)
  f.cleanup.resolve()
  await expect.poll(() => f.counts().quits).toBe(1)
})

test('unconfirmed startup acquisition cannot turn into a clean quit', async () => {
  const f = fixture()
  f.ready.resolve()
  await expect.poll(() => f.counts().installations).toBe(1)
  f.acquire.reject(new Error('Synthetic acquisition failure'))
  await rejects(f.owned.ready, { message: 'Synthetic acquisition failure' })
  f.quit()
  await expect.poll(() => f.logs).toEqual(['External annotation cleanup remains unconfirmed. Normal quit stays blocked.'])
  expect(f.counts()).toEqual({ installations: 1, closes: 0, prevented: 1, quits: 0 })
})
