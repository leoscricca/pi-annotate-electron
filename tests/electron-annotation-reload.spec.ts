import { test, expect } from '@playwright/test'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

// Exercise Pi's real loader with owned fixture modules, not the owner's session.
test('the actual extension reloads changed adapter code without replacing retained cleanup', async ({}, info) => {
  const loader = await import(new URL('./core/extensions/loader.js', import.meta.resolve('@earendil-works/pi-coding-agent')).href)
  const root = info.outputPath('reload-fixture')
  const extensions = join(root, 'extensions'), development = join(root, 'scripts/electron-development-ui')
  const legacy = join(root, 'scripts/electron-annotations')
  for (const directory of [extensions, development, legacy]) await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(root, 'package.json'), '{"type":"module","private":true}\n', { mode: 0o600 })
  const entry = join(extensions, 'annotate-electron.ts')
  await copyFile('extensions/annotate-electron.ts', entry)
  const refresh = 'scripts/electron-development-ui/load-adapter.mjs'
  if (existsSync(refresh)) await copyFile(refresh, join(development, 'load-adapter.mjs'))
  await writeFile(join(development, 'connection.cjs'), `module.exports = { ConnectionRefusal: class extends Error {}, discoverDevelopmentTargets() { throw Error('Unexpected discovery') }, connectDevelopmentTarget() { throw Error('Unexpected connection') } }\n`, { mode: 0o600 })
  await writeFile(join(development, 'images.cjs'), `module.exports = { readVerifiedImage() { throw Error('Unexpected image read') } }\n`, { mode: 0o600 })
  await writeFile(join(legacy, 'adapter.mjs'), `export function installAnnotationAdapter(pi, { development }) {
    pi.registerCommand('annotate-electron', { handler: async (action, ctx) => { const result = await development.perform(ctx, action); ctx.ui.notify(result.content[0].text, 'info') } })
    pi.on('session_shutdown', () => development.retire())
  }\n`, { mode: 0o600 })

  const key = Symbol.for('cnc.electron.development.sessions.v1'), evaluations = Symbol.for(`reload-evaluations-${randomUUID()}`)
  const globals = globalThis as unknown as Record<symbol, any>, previous = globals[key]
  let closeCalls = 0
  const close = Promise.reject(Object.assign(new Error('Retained fixture failure'), { code: 'CLEANUP_BLOCKED', outcome: 'unknown' }))
  void close.catch(() => {})
  const slot = { revision: 0, blocked: true, closing: close, jobs: new Set([new Promise(() => {})]),
    client: { active: false, binding: { session: 'fixture-owner', instance: 'fixture-app', window: 'fixture-window', generation: 1, connection: 'fixture-connection' },
      close: async () => { closeCalls += 1; throw new Error('Unexpected cleanup retry') } } }
  const state = { epoch: 0, slots: new Map([['fixture-owner', slot]]) }
  globals[key] = state
  const notices: string[] = []
  const ctx = { hasUI: true, sessionManager: { getSessionId: () => 'fixture-owner' }, ui: { notify: (message: string) => notices.push(message) } }
  const source = await readFile('scripts/electron-development-ui/adapter.mjs', 'utf8')
  const marker = 'Earlier cleanup is unconfirmed. No replacement target is available.'
  expect(source.includes(marker)).toBe(true)
  const instrumented = source + `\nglobalThis[Symbol.for(${JSON.stringify(Symbol.keyFor(evaluations))})] = (globalThis[Symbol.for(${JSON.stringify(Symbol.keyFor(evaluations))})] ?? 0) + 1\n`
  let current: any
  async function reloadStatus() {
    if (current) for (const handler of current.handlers.get('session_shutdown') ?? []) await handler({ type: 'session_shutdown', reason: 'reload' }, ctx)
    loader.clearExtensionCache()
    const loaded = await loader.loadExtensionsCached([entry], root)
    expect(loaded.errors).toEqual([])
    current = loaded.extensions[0]
    await current.commands.get('annotate-electron').handler('status', ctx)
    return JSON.parse(notices.pop()!)
  }
  try {
    await writeFile(join(development, 'adapter.mjs'), instrumented.replace(marker, 'Fixture revision one'), { mode: 0o600 })
    const before = await reloadStatus()
    expect(before.message).toBe('Fixture revision one')
    expect(before.cleanup.records[0].pendingLocalOperations).toBe(1)
    expect(globals[evaluations]).toBe(1)
    await reloadStatus()
    expect(globals[evaluations]).toBe(1)
    await writeFile(join(development, 'adapter.mjs'), instrumented.replace(marker, 'Fixture revision two'), { mode: 0o600 })
    const after = await reloadStatus()
    expect(after.message).toBe('Fixture revision two')
    expect(after.cleanup.records[0]).toEqual({ scope: 'current-session',
      target: { instance: 'fixture-app', window: 'fixture-window', generation: 1, connection: 'fixture-connection' },
      clientActive: false, pendingLocalOperations: 1, close: { state: 'rejected', code: 'CLEANUP_BLOCKED', outcome: 'unknown' } })
    expect(globals[evaluations]).toBe(2)
    expect(globals[key]).toBe(state)
    expect(state.slots.get('fixture-owner')).toBe(slot)
    expect(slot.blocked).toBe(true)
    expect(closeCalls).toBe(0)
  } finally {
    if (previous === undefined) delete globals[key]
    else globals[key] = previous
    delete globals[evaluations]
  }
})
