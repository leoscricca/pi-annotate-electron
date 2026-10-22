import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { installDevelopmentAdapter } from '../scripts/electron-development-ui/adapter.mjs'

const { createDevelopmentBridge, discoverDevelopmentTargets, connectDevelopmentTarget } = createRequire(import.meta.url)('../scripts/electron-development-ui/connection.cjs')
test.skip(process.platform === 'win32', 'The development bridge requires private POSIX sockets.')

async function fixture(options: { cleanup?: () => unknown; cleanupMs?: number; content?: () => Promise<any[]> } = {}) {
  const root = await mkdtemp('/tmp/cui-reopen-'), directory = join(root, 'registry')
  let opened = 0, cleaned = 0, discoveries = 0, resolveRevoked!: () => void
  const revoked = new Promise<void>(resolve => { resolveRevoked = resolve })
  const bridges: { close(): Promise<void>; revoke(window: string, reason: string, options: Record<string, unknown>): Promise<void> }[] = []
  const windows: string[] = [], sent: unknown[] = []
  const notes = new Map<string, { request: string; emit: (event: unknown) => void }>()
  let owner = 'reopen-owner'
  const state = { epoch: 0, slots: new Map<string, any>() }
  const ctx = { hasUI: true, sessionManager: { getSessionId: () => owner },
    ui: { select: async (_title: string, choices: string[]) => choices[0], notify() {} } }
  async function bridge(window: string) {
    const value = await createDevelopmentBridge({ directory, requestMs: 1000, cleanupMs: options.cleanupMs ?? 300,
      targets: () => [{ window, generation: 1, capabilities: ['annotation', 'snapshot', 'input', 'diagnostics'] }],
      openTarget(_binding: unknown, emit: (event: unknown) => void) { opened += 1; return {
        execute(action: string, params: any, request: string) {
          if (action === 'annotate') notes.set(window, { request, emit })
          return action === 'annotate' ? { state: 'picker-active', annotation: request, mode: params.mode } : { state: 'connected-idle' }
        }, async close() { cleaned += 1; await options.cleanup?.() },
      } },
    })
    bridges.push(value)
    return value
  }
  const adapter = installDevelopmentAdapter({ registerTool() {}, sendUserMessage(value: unknown) { sent.push(value) } }, { schema: {}, state,
    discover: async () => { discoveries += 1; return discoverDevelopmentTargets({ directory, timeoutMs: 1000 }) },
    connect: async (target, options) => {
      const client = await connectDevelopmentTarget(target, { ...options, directory, timeoutMs: 1000,
        onEvent(event: any) { options.onEvent(event); if (event.kind === 'revoked') resolveRevoked() },
      })
      windows.push(client.binding.window)
      return client
    }, content: options.content ?? (async () => []),
  })
  async function awaitRevoked() {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([revoked, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Missing revocation event')), 2000) })]) }
    finally { clearTimeout(timer) }
  }
  async function finish(passed: boolean, expectedBlocked = false) {
    const results = await Promise.allSettled([adapter.retire(), ...bridges.map(value => value.close())])
    const blocked = results.some(result => result.status === 'rejected')
    await writeFile(join(root, 'result.json'), JSON.stringify({ passed, cleanup: blocked ? 'blocked' : 'settled' }), { mode: 0o600 })
    if (passed && blocked && !expectedBlocked) throw new Error('Owned reopen fixture cleanup remained blocked')
  }
  return { bridge, adapter, ctx, state, windows, sent, awaitRevoked, finish,
    session(value: string) { owner = value },
    submit(window: string) { const note = notes.get(window)!; note.emit({ kind: 'annotation', request: note.request, outcome: 'submitted', mode: 'none',
      notes: [{ comment: 'Owned fixture note', selector: '#fixture', tag: 'button', name: 'Fixture', rect: { x: 1, y: 2, width: 3, height: 4 } }] }) },
    counts: () => ({ opened, cleaned, discoveries }) }
}

test('explicit connect selects the reopened app only after actual cleanup of the old connection', async () => {
  const f = await fixture()
  let passed = false
  try {
    const original = await f.bridge('original')
    await f.adapter.perform(f.ctx, 'connect')
    expect(f.windows).toEqual(['original'])
    await original.revoke('original', 'WINDOW_CLOSING', { waitForSettlement: true })
    await f.awaitRevoked()
    await original.close()
    expect(f.counts().cleaned).toBe(1)
    await f.bridge('reopened')
    expect(f.counts()).toEqual({ opened: 1, cleaned: 1, discoveries: 1 })
    const result = await f.adapter.perform(f.ctx, 'connect')
    expect(result.content).toEqual([{ type: 'text', text: 'Development window connected. The annotation picker is active. UI tools remain bound to this window.' }])
    expect(f.windows).toEqual(['original', 'reopened'])
    expect(f.counts()).toEqual({ opened: 2, cleaned: 1, discoveries: 2 })
    await f.adapter.perform(f.ctx, 'disconnect')
    expect(f.state.slots.size).toBe(0)
    passed = true
  } finally { await f.finish(passed) }
})


test('an early connect and a cleanup deadline cannot release the old target before actual settlement', async () => {
  let resolve!: () => void
  const cleanup = new Promise<void>(done => { resolve = done })
  const f = await fixture({ cleanup: () => cleanup, cleanupMs: 30 })
  let passed = false
  try {
    const original = await f.bridge('original')
    await f.adapter.perform(f.ctx, 'connect')
    await expect(original.revoke('original', 'WINDOW_CLOSING', {})).rejects.toMatchObject({ code: 'CLEANUP_BLOCKED', outcome: 'blocked' })
    await f.awaitRevoked()
    await expect(f.adapter.perform(f.ctx, 'connect')).rejects.toThrow('DEV_UI_TARGET_RETIRED')
    expect(f.counts().discoveries).toBe(1)
    expect(JSON.parse((await f.adapter.perform(f.ctx, 'status')).content[0].text).state).toBe('revoked')
    resolve()
    await original.revoke('original', 'WINDOW_CLOSING', { waitForSettlement: true })
    await original.close()
    await f.bridge('reopened')
    await f.adapter.perform(f.ctx, 'connect')
    expect(f.windows).toEqual(['original', 'reopened'])
    expect(f.counts().discoveries).toBe(2)
    await f.adapter.perform(f.ctx, 'disconnect')
    passed = true
  } finally { resolve(); await f.finish(passed) }
})

test('failed controller cleanup retains the old slot and blocks a replacement app', async () => {
  const f = await fixture({ cleanup: () => { throw new Error('Fixture cleanup failed') } })
  let passed = false
  try {
    const original = await f.bridge('original')
    await f.adapter.perform(f.ctx, 'connect')
    await expect(original.revoke('original', 'WINDOW_CLOSING', { waitForSettlement: true })).rejects.toThrow('Fixture cleanup failed')
    await f.awaitRevoked()
    await f.bridge('reopened')
    await expect(f.adapter.perform(f.ctx, 'connect')).rejects.toThrow('DEV_UI_TARGET_RETIRED')
    expect(f.windows).toEqual(['original'])
    expect(f.counts().discoveries).toBe(1)
    await expect(f.adapter.perform(f.ctx, 'disconnect')).rejects.toMatchObject({ code: 'CLEANUP_BLOCKED', outcome: 'blocked' })
    const status = JSON.parse((await f.adapter.perform(f.ctx, 'status')).content[0].text)
    expect(status.state).toBe('cleanup-blocked')
    expect(status.cleanup.blockedOwners).toBe(1)
    expect(status.cleanup.records[0].close).toEqual({ state: 'rejected', code: 'CLEANUP_BLOCKED', outcome: 'blocked' })
    passed = true
  } finally { await f.finish(passed, true) }
})


test('confirmed remote cleanup still joins local feedback and rejects a changed owner before discovery', async () => {
  let release!: (value: any[]) => void, preparing = false
  const prepared = new Promise<any[]>(resolve => { release = resolve })
  const f = await fixture({ content: () => { preparing = true; return prepared } })
  let passed = false
  try {
    const original = await f.bridge('original')
    await f.adapter.perform(f.ctx, 'connect')
    f.submit('original')
    await expect.poll(() => preparing).toBe(true)
    await original.revoke('original', 'WINDOW_CLOSING', { waitForSettlement: true })
    await f.awaitRevoked()
    await original.close()
    await f.bridge('reopened')
    const reconnect = f.adapter.perform(f.ctx, 'connect').then(value => ({ value }), error => ({ error: error.message }))
    expect(f.counts().discoveries).toBe(1)
    expect(f.sent).toEqual([])
    f.session('replacement-owner')
    release([{ type: 'text', text: 'This stale note must not arrive' }])
    expect(await reconnect).toEqual({ error: 'DEV_UI_STALE_SOURCE' })
    expect(f.counts().discoveries).toBe(1)
    expect(f.sent).toEqual([])
    await f.adapter.perform(f.ctx, 'connect')
    expect(f.windows).toEqual(['original', 'reopened'])
    await f.adapter.perform(f.ctx, 'disconnect')
    passed = true
  } finally { release([]); await f.finish(passed) }
})
