import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { discoverDevelopmentTargets, connectDevelopmentTarget } = require('../scripts/electron-development-ui/connection.cjs')
type Trace = { kind: string; pid?: number; bytes?: number; visible?: boolean; code?: number }
type Terminal = { kind: string; pid?: number; foreground?: number; code?: number; text?: string; signal?: string }

async function launch(stage: 'startup' | 'capture') {
  const root = await fs.mkdtemp('/tmp/aelt-')
  await fs.chmod(root, 0o700)
  for (const dir of ['app', 'home', 'profile', 'tmp']) await fs.mkdir(path.join(root, dir), { mode: 0o700 })
  await fs.writeFile(path.join(root, 'app/package.json'), JSON.stringify({ name: 'Owned interrupt fixture', type: 'module', main: 'main.mjs' }), { mode: 0o600 })
  await fs.copyFile(path.resolve('tests/fixtures/launcher-interrupt-app.mjs'), path.join(root, 'app/main.mjs'))
  await fs.writeFile(path.join(root, 'app/index.html'), '<!doctype html><title>Owned interrupt fixture</title><button>Interrupt fixture</button>', { mode: 0o600 })
  const driver = spawn('python3', [path.resolve('tests/fixtures/launcher-terminal.py'), process.execPath,
    path.resolve('bin/launch.mjs'), '--app', path.join(root, 'app'), '--renderer', 'index.html', '--profile', path.join(root, 'profile')], {
    env: { PATH: process.env.PATH, HOME: path.join(root, 'home'), TMPDIR: path.join(root, 'tmp'), LANG: 'en_US.UTF-8',
      PYTHONUNBUFFERED: '1', PI_ANNOTATE_TEST_PACKAGE: path.resolve('package.json'), PI_ANNOTATE_TEST_STAGE: stage },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const messages: Terminal[] = []
  let pending = '', errors = ''
  driver.stdout.setEncoding('utf8')
  driver.stdout.on('data', (text: string) => {
    pending += text
    let end: number
    while ((end = pending.indexOf('\n')) >= 0) {
      messages.push(JSON.parse(pending.slice(0, end)))
      pending = pending.slice(end + 1)
    }
  })
  driver.stderr.setEncoding('utf8'); driver.stderr.on('data', (text: string) => { errors += text })
  let driverError: string | undefined
  driver.once('error', error => { driverError = error.message })
  const trace = async (): Promise<Trace[]> => {
    try { return (await fs.readFile(path.join(root, 'trace.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  const command = (value: object) => driver.stdin.write(JSON.stringify(value) + '\n')
  const release = async () => {
    for (const name of ['startup-release', 'capture-release']) await fs.writeFile(path.join(root, name), 'release', { mode: 0o600 })
  }
  const finish = async () => {
    await release()
    if (!messages.some(message => message.kind === 'exit') && !driverError) command({ kind: 'quit' })
    try { await expect.poll(() => messages.find(message => message.kind === 'exit'), { timeout: 15_000 }).toMatchObject({ kind: 'exit' }) }
    catch (error) { errors += '\nTest cleanup remains unconfirmed: ' + String(error) }
    finally {
      await fs.writeFile(path.join(root, 'terminal-evidence.json'), JSON.stringify({ messages, errors, driverError, trace: await trace() }, null, 2), { mode: 0o600 })
      console.info('Owned launcher terminal evidence:', root)
    }
  }
  try {
    await expect.poll(() => messages.find(message => message.kind === 'ready'), { timeout: 10_000 }).toMatchObject({ kind: 'ready' })
    const ready = messages.find(message => message.kind === 'ready')!
    expect(ready.pid).toBe(ready.foreground)
    expect(driverError).toBeUndefined()
  } catch (error) { await finish(); throw error }
  return { root, trace, messages, command, release, finish, registry: path.join(root, 'tmp', `cui-${process.getuid!()}`) }
}

test('actual launcher terminal Ctrl+C joins pending startup before normal exit', async () => {
  test.setTimeout(40_000)
  const f = await launch('startup')
  try {
    await expect.poll(async () => (await f.trace()).map(value => value.kind)).toContain('entry')
    f.command({ kind: 'interrupt' })
    await expect.poll(async () => (await f.trace()).map(value => value.kind)).toContain('before-quit')
    expect(f.messages.filter(value => value.kind === 'exit')).toEqual([])
    expect((await f.trace()).filter(value => value.kind === 'startup-settled' || value.kind === 'quit')).toEqual([])
    f.command({ kind: 'signal', signal: 'SIGTERM' })
    await f.release()
    await expect.poll(() => f.messages.find(value => value.kind === 'exit'), { timeout: 15_000 }).toEqual({ kind: 'exit', code: 0 })
    const kinds = (await f.trace()).map(value => value.kind)
    expect(kinds.indexOf('startup-settled')).toBeLessThan(kinds.indexOf('will-quit'))
    expect((await f.trace()).find(value => value.kind === 'quit')).toEqual({ kind: 'quit', code: 0 })
  } finally { await f.finish() }
})

test('actual launcher terminal interrupt revokes a capture and waits past the cleanup deadline for settlement', async () => {
  test.setTimeout(50_000)
  const f = await launch('capture')
  let ui: any
  try {
    await expect.poll(async () => (await f.trace()).find(value => value.kind === 'window-ready')).toEqual({ kind: 'window-ready', visible: false })
    await expect.poll(async () => (await discoverDevelopmentTargets({ directory: f.registry })).length).toBe(1)
    const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
    const events: any[] = []
    ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'launcher-interrupt-pane', onEvent: (event: unknown) => events.push(event) })
    const snapshot = (await ui.request('snapshot')).value
    expect(snapshot.nodes.map((node: { name: string }) => node.name)).toContain('Interrupt fixture')
    const result = ui.request('screenshot').then((value: unknown) => ({ value }), (error: { code: string; outcome: string }) => ({ code: error.code, outcome: error.outcome }))
    await expect.poll(async () => (await f.trace()).map(value => value.kind)).toContain('capture-entered')
    f.command({ kind: 'interrupt' })
    await expect.poll(() => events.map(event => event.kind)).toContain('revoked')
    expect(await result).toEqual({ code: 'STALE_TARGET', outcome: 'revoked' })
    expect(ui.active).toBe(false)
    expect(ui.cleanupConfirmed).toBe(false)
    expect(await discoverDevelopmentTargets({ directory: f.registry })).toEqual([])
    f.command({ kind: 'signal', signal: 'SIGTERM' }); f.command({ kind: 'signal', signal: 'SIGHUP' })
    await expect.poll(() => f.messages.filter(value => value.kind === 'signal-sent').map(value => value.signal)).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP'])
    await expect.poll(async () => (await f.trace()).map(value => value.kind), { timeout: 10_000 }).toContain('capture-held-past-deadline')
    expect(f.messages.filter(value => value.kind === 'exit')).toEqual([])
    expect((await f.trace()).filter(value => value.kind === 'contents-destroyed' || value.kind === 'quit')).toEqual([])
    expect(events.filter(event => event.kind === 'annotation')).toEqual([])
    expect(ui.cleanupConfirmed).toBe(false)
    await f.release()
    await expect.poll(() => ui.cleanupConfirmed, { timeout: 15_000 }).toBe(true)
    await expect.poll(() => f.messages.find(value => value.kind === 'exit'), { timeout: 15_000 }).toEqual({ kind: 'exit', code: 0 })
    const log = await f.trace(), kinds = log.map(value => value.kind)
    expect(log.find(value => value.kind === 'capture-settled')!.bytes).toBeGreaterThan(0)
    expect(kinds.indexOf('capture-settled')).toBeLessThan(kinds.indexOf('contents-destroyed'))
    expect(kinds.indexOf('capture-settled')).toBeLessThan(kinds.indexOf('will-quit'))
    expect(log.find(value => value.kind === 'quit')).toEqual({ kind: 'quit', code: 0 })
    expect(events.filter(event => event.kind === 'cleanup-complete')).toHaveLength(1)
  } finally {
    await f.finish()
    if (ui?.cleanupConfirmed) await ui.close()
  }
})
