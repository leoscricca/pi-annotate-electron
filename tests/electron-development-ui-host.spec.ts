import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { installDevelopmentAdapter } from '../scripts/electron-development-ui/adapter.mjs'
import { installAnnotationAdapter } from '../scripts/electron-annotations/adapter.mjs'
import { createOfflineAnnotationSession } from './fixtures/electron-development-ui-sdk'

const require = createRequire(import.meta.url)
const { discoverDevelopmentTargets, connectDevelopmentTarget } = require('../scripts/electron-development-ui/connection.cjs')
const { installDevelopmentUi } = require('../scripts/electron-development-ui/host.cjs')
const { readVerifiedImage, ownedImageRemovalCandidates } = require('../scripts/electron-development-ui/images.cjs')
const run = promisify(execFile)
const repository = process.cwd()
let output: string
const launches: { root: string; application: ElectronApplication; child: ReturnType<ElectronApplication['process']>; terminal: Promise<{ code: number | null; signal: string | null }> }[] = []

test.skip(process.platform !== 'darwin', 'Native development host acceptance currently covers macOS only.')
test.beforeAll(async () => {
  test.setTimeout(120_000)
  await fs.access(path.join(repository, 'out/main/index.js'))
  const evidence = process.env.CNC_DEV_UI_TEST_EVIDENCE ?? await fs.realpath('/tmp')
  output = await fs.mkdtemp(path.join(evidence, 'cui-dev-build-'))
  await fs.chmod(output, 0o700)
  await fs.writeFile(path.join(output, '.owned-dev-ui-fixture'), 'isolated development build', { mode: 0o600 })
  try {
    const result = await run(process.execPath, [path.join(repository, 'scripts/build-fixture.mjs'), '--output', output], {
      cwd: repository, timeout: 90_000, maxBuffer: 2 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: output, NODE_ENV: 'test' },
    })
    await fs.writeFile(path.join(output, 'build.log'), result.stdout + result.stderr, { mode: 0o600 })
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string }
    await fs.writeFile(path.join(output, 'build-failed.log'), `${detail.stdout ?? ''}\n${detail.stderr ?? ''}`, { mode: 0o600 })
    throw error
  }
  await fs.writeFile(path.join(output, 'package.json'), JSON.stringify({ type: 'module', main: 'main/index.js' }), { mode: 0o600 })
  await fs.symlink(path.join(repository, 'node_modules'), path.join(output, 'node_modules'), 'dir')
})
async function launch(main: string, options: { visible?: boolean } = {}) {
  const root = await fs.realpath(await fs.mkdtemp('/tmp/cui-host-'))
  const home = path.join(root, 'home'); const profile = path.join(root, 'profile'); const temp = path.join(root, 'tmp')
  for (const directory of [home, profile, temp]) await fs.mkdir(directory, { mode: 0o700 })
  await fs.writeFile(path.join(root, '.owned-dev-ui-fixture'), 'isolated hidden Electron', { mode: 0o600 })
  await fs.writeFile(path.join(root, 'launch.json'), JSON.stringify({ main, home, profile, temp, state: 'requested' }), { mode: 0o600 })
  let application: ElectronApplication
  try {
    application = await electron.launch({ args: [path.join(repository, 'tests/fixtures/electron-development-ui-boot.cjs'), main,
    ...(main.startsWith(output + path.sep) ? ['--external-bridge'] : []), `--user-data-dir=${profile}`], cwd: repository, timeout: 30_000,
  env: { PATH: process.env.PATH ?? '', HOME: home, USERPROFILE: home, TMPDIR: temp, TMP: temp, TEMP: temp,
    XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: temp, XDG_DATA_HOME: profile,
    CNC_DEV_UI_FIXTURE_ROOT: root, CNC_MENDIX_E2E_HOME: home } })
  } catch (error) {
    await fs.writeFile(path.join(root, 'startup-unknown.json'), JSON.stringify({ main, state: 'startup-failed', appClosure: 'not-confirmed' }), { mode: 0o600 })
    console.log(`Retained owned startup fixture: ${root}`)
    throw error
  }
  const child = application.process()
  const terminal = new Promise<{ code: number | null; signal: string | null }>(resolve => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  launches.push({ root, application, child, terminal })
  expect(await application.evaluate(({ app }) => ({ home: app.getPath('home'), profile: app.getPath('userData'), temp: app.getPath('temp') })))
    .toEqual({ home, profile, temp })
  const page = await application.firstWindow()
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ timeout: 15_000 })
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.isVisible()))).toEqual([false])
  if (options.visible) {
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.show())
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true)
  }
  return { root, application, page, registry: path.join(temp, `cui-${process.getuid!()}`) }
}
async function pickerEvidence(application: ElectronApplication, root: string, connection: string, events: unknown[]) {
  const renderer = await application.evaluate(async ({ BrowserWindow }, owner) => BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScriptInIsolatedWorld(1004,
    [{ code: `window.__CNC_DEV_PICKER__?.call('inspect',{},${JSON.stringify(owner)})` }]), connection)
  await fs.writeFile(path.join(output, `picker-debug-${path.basename(root)}.json`), JSON.stringify({ renderer, events }, null, 2), { mode: 0o600 })
}
test.afterEach(async ({}, info) => {
  for (const item of launches.splice(0)) {
    let timer: NodeJS.Timeout | undefined
    let terminal: { code: number | null; signal: string | null } | undefined
    try {
      terminal = await Promise.race([(async () => {
        if (item.child.exitCode === null && item.child.signalCode === null) await item.application.close()
        return item.terminal
      })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Owned Electron graceful close timed out.')), 10_000)
        })])
      expect(terminal).toEqual({ code: 0, signal: null })
    } catch (error) {
      item.child.kill('SIGTERM')
      await fs.writeFile(path.join(item.root, 'cleanup-unknown.json'), JSON.stringify({ test: info.title, status: info.status,
        gracefulClose: false, terminationRequested: true }), { mode: 0o600 })
      throw error
    } finally { if (timer) clearTimeout(timer) }
    await fs.writeFile(path.join(output, `close-${path.basename(item.root)}.json`), JSON.stringify({ test: info.title, terminal }), { mode: 0o600 })
    if (info.status === 'passed') await fs.rm(item.root, { recursive: true })
    else console.log(`Retained owned hidden Electron fixture: ${item.root}`)
  }
})

for (const phase of ['idle', 'picker']) {
  test(`native window close exits normally with an attached ${phase} connection`, async () => {
    const f = await launch(path.join(output, 'main/index.js'))
    const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
    const events: any[] = []
    const client = await connectDevelopmentTarget(target, { directory: f.registry, session: `window-close-${phase}`, onEvent: (event: unknown) => events.push(event) })
    const owned = launches.find(item => item.application === f.application)!
    let timer: NodeJS.Timeout | undefined
    try {
      if (phase === 'picker') {
        await client.request('annotate', { mode: 'none' })
        await expect(f.page.locator('#pi-panel')).toBeVisible()
      } else expect((await client.request('status')).value).toEqual({ state: 'connected-idle' })
      await f.application.evaluate(({ BrowserWindow }) => { setImmediate(() => BrowserWindow.getAllWindows()[0]!.close()) })
      const terminal = await Promise.race([owned.terminal, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Native window close did not settle app shutdown.')), 12_000)
      })])
      expect(terminal).toEqual({ code: 0, signal: null })
      expect(client.active).toBe(false)
      expect(events.filter(event => event.kind === 'revoked')).toEqual([expect.objectContaining({ kind: 'revoked', reason: 'TARGET_CLOSED' })])
      expect(await discoverDevelopmentTargets({ directory: f.registry })).toEqual([])
      await fs.writeFile(path.join(output, `native-window-close-${phase}.json`), JSON.stringify({ phase, terminal, revoked: true, active: client.active }), { mode: 0o600 })
    } finally { if (timer) clearTimeout(timer); await client.close().catch(() => {}) }
  })
}

for (const late of [false, true]) {
test(`native duplicate close joins ${late ? 'late ' : ''}pending capture before renderer destruction`, async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const owned = launches.find(item => item.application === f.application)!
  await f.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents
    const original = contents.capturePage
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const state = { entered: false, release, restore: () => { contents.capturePage = original } }
    contents.capturePage = async (rect, options) => { state.entered = true; await gate; return original.call(contents, rect, options) }
    ;(globalThis as unknown as { __CNC_CLOSE_CAPTURE__: typeof state }).__CNC_CLOSE_CAPTURE__ = state
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const client = await connectDevelopmentTarget(target, { directory: f.registry, session: 'pending-close-capture' })
  const capture = client.request('screenshot').then((value: unknown) => ({ value }), (error: { code: string; outcome: string }) => ({ code: error.code, outcome: error.outcome }))
  let timer: NodeJS.Timeout | undefined
  try {
    await expect.poll(() => f.application.evaluate(() => (globalThis as unknown as { __CNC_CLOSE_CAPTURE__: { entered: boolean } }).__CNC_CLOSE_CAPTURE__.entered)).toBe(true)
    await f.application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]!; window.close(); window.close() })
    await expect.poll(() => client.active).toBe(false)
    expect(await discoverDevelopmentTargets({ directory: f.registry })).toEqual([])
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ destroyed: window.isDestroyed(), visible: window.isVisible() }))))
      .toEqual([{ destroyed: false, visible: false }])
    expect(owned.child.exitCode).toBe(null)
    expect(await capture).toEqual({ code: 'STALE_TARGET', outcome: 'revoked' })
    if (late) {
      expect((await client.request('disconnect')).value).toEqual({ state: 'cleanup-blocked' })
      await f.application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]!; window.close(); window.close() })
      expect(await discoverDevelopmentTargets({ directory: f.registry })).toEqual([])
      expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ destroyed: window.isDestroyed(), visible: window.isVisible() }))))
        .toEqual([{ destroyed: false, visible: false }])
      expect(owned.child.exitCode).toBe(null)
    }
    await f.application.evaluate(() => { const state = (globalThis as unknown as { __CNC_CLOSE_CAPTURE__: { release(): void; restore(): void } }).__CNC_CLOSE_CAPTURE__; state.release(); state.restore() })
    const terminal = await Promise.race([owned.terminal, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Window close did not settle after actual capture completion.')), 12_000)
    })])
    expect(terminal).toEqual({ code: 0, signal: null })
    await fs.writeFile(path.join(output, `native-window-close-${late ? 'late-' : ''}pending-capture.json`), JSON.stringify({ terminal, duplicateClose: true, captureRevoked: true, deadlineExpired: late }), { mode: 0o600 })
  } finally {
    if (timer) clearTimeout(timer)
    if (owned.child.exitCode === null && owned.child.signalCode === null) {
      await f.application.evaluate(() => { const state = (globalThis as unknown as { __CNC_CLOSE_CAPTURE__: { release(): void; restore(): void } }).__CNC_CLOSE_CAPTURE__; state.release(); state.restore() }).catch(() => {})
    }
    await client.close().catch(() => {})
  }
})

}

test('native close rejects real cleanup failure without closure or replacement', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const owned = launches.find(item => item.application === f.application)!
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const client = await connectDevelopmentTarget(target, { directory: f.registry, session: 'failed-close-cleanup' })
  let blocked = false
  const errors: string[] = []
  owned.child.stderr?.on('data', data => {
    const text = data.toString()
    errors.push(text)
    if (errors.join('').includes('Development UI window close is blocked by unresolved owned cleanup.')) blocked = true
  })
  let timer: NodeJS.Timeout | undefined
  const waitForTerminal = async () => {
    try { return await Promise.race([owned.terminal, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Owned rejection fixture termination is unconfirmed.')), 5_000) })]) }
    finally { if (timer) clearTimeout(timer) }
  }
  try {
    expect(await f.application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScriptInIsolatedWorld(1004,
      [{ code: `(() => { const api=window.__CNC_DEV_UI_PAGE__; const call=api.call; api.call=function(method,...args) { return method==='close' ? {ok:false} : call.call(this,method,...args) }; return true })()` }]))).toBe(true)
    await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close())
    await expect.poll(() => blocked).toBe(true)
    expect((await client.request('disconnect')).value).toEqual({ state: 'cleanup-blocked' })
    await f.application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]!; window.close(); window.close() })
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ destroyed: window.isDestroyed(), visible: window.isVisible() }))))
      .toEqual([{ destroyed: false, visible: false }])
    expect(await discoverDevelopmentTargets({ directory: f.registry })).toEqual([])
    expect(client.active).toBe(false)
    expect(owned.child.exitCode).toBe(null)
  } finally {
    await client.close().catch(() => {})
    let terminationRequested = false
    if (owned.child.exitCode === null && owned.child.signalCode === null) { terminationRequested = true; owned.child.kill('SIGTERM') }
    let terminal
    try { terminal = await waitForTerminal() }
    catch { owned.child.kill('SIGKILL'); terminal = await waitForTerminal() }
    const receipt = { cleanup: blocked ? 'rejected' : 'unconfirmed', gracefulClose: false, terminationRequested, terminal }
    await fs.writeFile(path.join(f.root, 'expected-cleanup-rejection.json'), JSON.stringify(receipt), { mode: 0o600 })
    await fs.writeFile(path.join(f.root, 'stderr.log'), errors.join(''), { mode: 0o600 })
    await fs.writeFile(path.join(output, 'native-window-close-cleanup-rejection.json'), JSON.stringify({ root: f.root, ...receipt }), { mode: 0o600 })
    launches.splice(launches.indexOf(owned), 1)
    console.log(`Retained expected cleanup-rejection fixture: ${f.root}`)
  }
})

test('the real development main registers a private isolated bridge without a second window owner', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const targets = await discoverDevelopmentTargets({ directory: f.registry })
  expect(targets).toEqual([{ kind: 'attached-development', instance: expect.any(String), window: expect.any(String), generation: expect.any(Number),
    label: 'CnC Mendix Agent development', capabilities: expect.any(Array) }])
  expect(await f.application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScriptInIsolatedWorld(1004,
    [{ code: 'typeof window.__CNC_DEV_UI__?.post' }]))).toBe('function')
  expect(await f.page.evaluate(() => ({ bridge: typeof (window as unknown as { __CNC_DEV_UI__?: unknown }).__CNC_DEV_UI__,
    process: typeof (window as unknown as { process?: unknown }).process, require: typeof (window as unknown as { require?: unknown }).require })))
    .toEqual({ bridge: 'undefined', process: 'undefined', require: 'undefined' })
  const client = await connectDevelopmentTarget(targets[0], { directory: f.registry, session: 'host-proof-pane' })
  try {
    expect((await client.request('status')).value).toEqual({ state: 'connected-idle' })
    const generation = client.binding.generation
    await f.page.reload()
    await f.page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
    await expect.poll(() => client.active).toBe(false)
    const fresh = await discoverDevelopmentTargets({ directory: f.registry })
    expect(fresh).toHaveLength(1)
    expect(fresh[0]).toMatchObject({ kind: 'attached-development', instance: targets[0].instance, window: targets[0].window })
    expect(fresh[0].generation).toBeGreaterThan(generation)
  } finally { await client.close() }
  expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ destroyed: window.isDestroyed(), visible: window.isVisible() }))))
    .toEqual([{ destroyed: false, visible: false }])
})

test('frontend debugger ownership refuses another owner and revokes on unexpected detachment', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  expect(target).toMatchObject({ kind: 'attached-development', label: 'CnC Mendix Agent development' })
  await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.debugger.attach('1.3'))
  try {
    await expect(connectDevelopmentTarget(target, { directory: f.registry, session: 'blocked-pane' })).rejects.toMatchObject({ code: 'UNAVAILABLE' })
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.debugger.isAttached())).toBe(true)
  } finally {
    await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.debugger.detach())
  }
  const client = await connectDevelopmentTarget(target, { directory: f.registry, session: 'connected-pane' })
  try {
    expect((await client.request('status')).value).toEqual({ state: 'connected-idle' })
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.debugger.isAttached())).toBe(true)
    await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.debugger.detach())
    await expect.poll(() => client.active).toBe(false)
    await expect(client.request('status')).rejects.toMatchObject({ code: 'UNAVAILABLE', outcome: 'revoked' })
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.debugger.isAttached())).toBe(false)
  } finally { await client.close() }
  const fresh = await connectDevelopmentTarget(target, { directory: f.registry, session: 'fresh-owner-pane' })
  try {
    expect((await fresh.request('status')).value).toEqual({ state: 'connected-idle' })
    await f.application.evaluate(({ BrowserWindow }) => {
      const frontend = BrowserWindow.getAllWindows()[0]!.webContents.debugger
      frontend.detach(); frontend.attach('1.3')
    })
    await expect.poll(() => fresh.active).toBe(false)
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.debugger.isAttached())).toBe(true)
  } finally {
    await fresh.close()
    await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.debugger.detach())
  }
  expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ visible: window.isVisible(), attached: window.webContents.debugger.isAttached() }))))
    .toEqual([{ visible: false, attached: false }])
})

test('the synthetic sample records an ordinary product click without a live backend', async () => {
  const f = await launch(path.join(repository, 'out/main/index.js'))
  await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
  await f.page.getByRole('button', { name: 'Connect Codex', exact: true }).click()
  await expect.poll(() => f.application.evaluate(() =>
    (globalThis as typeof globalThis & { __ANNOTATION_FIXTURE_OPERATIONS__: string[] }).__ANNOTATION_FIXTURE_OPERATIONS__))
    .toEqual(['connect'])
  expect(await f.page.evaluate(() => window.conversation!.getSnapshot())).toMatchObject({ sessionId: null, messages: [] })
})

test('real UI snapshots and native input preserve the draft through normal Settings and theme controls', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  expect(target.capabilities).toEqual(expect.arrayContaining(['snapshot', 'input']))
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'normal-ui-pane' })
  async function ref(role: string, name: string) {
    const snapshot = (await ui.request('snapshot')).value
    const node = snapshot.nodes.find((item: { role: string; name: string }) => item.role === role && item.name === name)
    expect(node, `Missing ${role} ${name}`).toBeTruthy()
    return { ref: node.ref, revision: snapshot.revision }
  }
  try {
    await ui.request('fill', { ...await ref('textbox', 'Message composer'), text: 'Synthetic annotation draft' })
    await expect(f.page.getByRole('textbox', { name: 'Message composer', exact: true })).toHaveText('Synthetic annotation draft')
    await ui.request('click', await ref('button', 'Settings'))
    await expect(f.page.getByRole('dialog')).toBeVisible()
    const dark = (await ui.request('snapshot')).value
    expect(dark.nodes.find((item: { role: string; name: string }) => item.role === 'switch' && item.name === 'Light color scheme'))
      .toMatchObject({ value: 'false' })
    await ui.request('click', await ref('switch', 'Light color scheme'))
    await expect(f.page.locator('body')).toHaveAttribute('data-preview-color-scheme', 'light')
    await expect(f.page.locator('.main-content-safe-area')).toHaveCSS('background-color', 'rgb(253, 252, 250)')
    await ui.request('click', await ref('button', 'Close Settings'))
    await expect(f.page.getByRole('dialog')).toHaveCount(0)
    await ui.request('click', await ref('button', 'Settings'))
    await expect(f.page.getByRole('dialog')).toBeVisible()
    await ui.request('key', { key: 'Escape' })
    await expect(f.page.getByRole('dialog')).toHaveCount(0)
    await expect(f.page.getByRole('textbox', { name: 'Message composer', exact: true })).toHaveText('Synthetic annotation draft')
    expect(await f.page.evaluate(() => window.conversation!.getSnapshot())).toMatchObject({ sessionId: null, messages: [] })
  } finally { await ui.close() }
  expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.isVisible()))).toEqual([false])
})

test('literal text, native keys, double-click, scrolling and stale-reference refusal use the selected document', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.page.evaluate(() => {
    const field = document.createElement('textarea'); field.id = 'native-ui-field'; field.setAttribute('aria-label', 'Native UI field')
    field.style.cssText = 'position:fixed;left:100px;top:200px;width:200px;height:80px;z-index:1000'; document.body.append(field)
    const scroll = document.createElement('div'); scroll.id = 'native-ui-scroll'; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Native scroll field')
    scroll.style.cssText = 'position:fixed;left:350px;top:100px;width:180px;height:100px;overflow:auto;z-index:1000'
    const content = document.createElement('div'); content.style.height = '1000px'; content.textContent = 'Literal local development scroll fixture'; scroll.append(content); document.body.append(scroll)
    const button = document.createElement('button'); button.textContent = 'Native double-click fixture'; button.id = 'native-ui-double'; button.dataset.count = '0'
    button.style.cssText = 'position:fixed;left:350px;top:300px;z-index:1000'
    button.addEventListener('dblclick', () => { button.dataset.count = String(Number(button.dataset.count) + 1) }); document.body.append(button)
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'literal-ui-pane' })
  try {
    const snapshot = (await ui.request('snapshot')).value
    expect(snapshot.nodes[0]).toMatchObject({ tag: 'body', depth: 0 })
    const field = snapshot.nodes.find((item: { name: string }) => item.name === 'Native UI field')
    const scroll = snapshot.nodes.find((item: { name: string }) => item.name === 'Native scroll field')
    const button = snapshot.nodes.find((item: { name: string }) => item.name === 'Native double-click fixture')
    const text = 'const path = "/tmp/does-not-run"; // literal UI text'
    await ui.request('fill', { ref: field.ref, revision: snapshot.revision, text })
    await expect(f.page.locator('#native-ui-field')).toHaveValue(text)
    await ui.request('key', { key: 'Backspace' })
    await expect(f.page.locator('#native-ui-field')).toHaveValue(text.slice(0, -1))
    expect((await ui.request('scroll', { ref: scroll.ref, revision: snapshot.revision, direction: 'down', amount: 96 })).value).toEqual({ outcome: 'observed' })
    expect(await f.page.locator('#native-ui-scroll').evaluate(node => node.scrollTop)).toBe(96)
    await ui.request('click', { ref: button.ref, revision: snapshot.revision, count: 2 })
    await expect(f.page.locator('#native-ui-double')).toHaveAttribute('data-count', '1')
    await f.page.locator('#native-ui-field').evaluate(node => node.setAttribute('aria-label', 'Changed semantic field'))
    await expect(ui.request('fill', { ref: field.ref, revision: snapshot.revision, text: 'not dispatched' }))
      .rejects.toMatchObject({ code: 'STALE_REFERENCE', outcome: 'refused' })
    await expect(f.page.locator('#native-ui-field')).toHaveValue(text.slice(0, -1))
    const fresh = (await ui.request('snapshot')).value
    expect(fresh.nodes.find((item: { name: string }) => item.name === 'Changed semantic field')).toMatchObject({ value: text.slice(0, -1) })
    await expect(ui.request('click', { ref: button.ref, revision: snapshot.revision })).rejects.toMatchObject({ code: 'STALE_REFERENCE' })
  } finally { await ui.close() }
})

for (const transition of ['reconnect', 'reload', 'different-window']) {
  test(`CUI-1 retired references cannot operate after ${transition}`, async () => {
    const first = await launch(path.join(output, 'main/index.js'))
    let selected = first
    async function documentFixture() {
      await selected.page.evaluate(() => {
        const button = document.createElement('button'); button.textContent = 'Reference fixture action'; button.dataset.count = '0'
        button.style.cssText = 'position:fixed;left:40px;top:100px;width:200px;height:40px'
        button.addEventListener('click', () => { button.dataset.count = String(Number(button.dataset.count) + 1) })
        const field = document.createElement('textarea'); field.setAttribute('aria-label', 'Reference fixture input'); field.value = 'Original input'
        field.style.cssText = 'position:fixed;left:40px;top:200px;width:200px;height:80px'
        const scroll = document.createElement('div'); scroll.id = 'reference-scroll'; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Reference fixture scroll')
        scroll.style.cssText = 'position:fixed;left:300px;top:100px;width:200px;height:100px;overflow:auto'
        const content = document.createElement('div'); content.style.height = '1000px'; content.textContent = 'Reference fixture content'; scroll.append(content)
        document.body.replaceChildren(button, field, scroll)
      })
    }
    const commands = new Map<string, any>(), tools = new Map<string, any>(), hooks = new Map<string, any>()
    const pi = { registerCommand: (name: string, value: any) => commands.set(name, value), registerTool: (value: any) => tools.set(value.name, value),
      on: (name: string, value: any) => hooks.set(name, value), sendUserMessage: () => { throw new Error('Cancelled pickers must not submit notes') } }
    const development = installDevelopmentAdapter(pi, { schema: {}, state: { epoch: 0, slots: new Map() },
      discover: () => discoverDevelopmentTargets({ directory: selected.registry }),
      connect: (target, options) => connectDevelopmentTarget(target, { ...options, directory: selected.registry }) })
    installAnnotationAdapter(pi, { schema: {}, development, state: { epoch: 0, slots: new Map() },
      createLaunch: async () => { throw new Error('This test must not create a synthetic child') } })
    const ctx = { hasUI: true, sessionManager: { getSessionId: () => 'reference-regression-pane' }, ui: {
      select: async () => undefined, notify() {}, confirm: async () => { throw new Error('No child approval is required') } } }
    const command = (action: string) => commands.get('annotate-electron').handler(action, ctx)
    const tool = (action: string, params = {}) => tools.get('electron_ui').execute('call', { action, ...params }, undefined, undefined, ctx)
    const snapshot = async () => JSON.parse((await tool('snapshot')).content[0].text)
    const refs = (value: any) => Object.fromEntries(['action', 'input', 'scroll'].map(kind => {
      const node = value.nodes.find((item: { name: string }) => item.name === `Reference fixture ${kind}`)
      expect(node).toMatchObject({ ref: expect.any(String) })
      return [kind, { ref: node.ref, revision: value.revision }]
    }))
    try {
      await documentFixture()
      await command('connect'); await command('cancel')
      const old = refs(await snapshot())
      await command('close')
      if (transition === 'reload') {
        await selected.page.reload()
        await selected.page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
      } else if (transition === 'different-window') selected = await launch(path.join(output, 'main/index.js'))
      await documentFixture()
      await selected.application.evaluate(({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0]!.webContents, capture = contents.capturePage
        const state = { calls: 0 }
        contents.capturePage = (...args) => { state.calls += 1; return capture.apply(contents, args) }
        ;(globalThis as unknown as { __CUI_REF_CAPTURE__: typeof state }).__CUI_REF_CAPTURE__ = state
      })
      await command('connect'); await command('cancel')
      refs(await snapshot())
      const outcomes: string[] = []
      for (const [action, params] of [
        ['click', old.action], ['fill', { ...old.input, text: 'Retired input' }],
        ['scroll', { ...old.scroll, direction: 'down', amount: 96 }], ['screenshot', old.action],
      ] as [string, Record<string, unknown>][]) {
        try { await tool(action, params); outcomes.push('executed') } catch { outcomes.push('refused') }
      }
      expect(outcomes).toEqual(['refused', 'refused', 'refused', 'refused'])
      await expect(selected.page.getByRole('button', { name: 'Reference fixture action', exact: true })).toHaveAttribute('data-count', '0')
      await expect(selected.page.getByRole('textbox', { name: 'Reference fixture input', exact: true })).toHaveValue('Original input')
      expect(await selected.page.locator('#reference-scroll').evaluate(node => node.scrollTop)).toBe(0)
      expect(await selected.application.evaluate(() => (globalThis as unknown as { __CUI_REF_CAPTURE__: { calls: number } }).__CUI_REF_CAPTURE__.calls)).toBe(0)
      const fresh = refs(await snapshot())
      await tool('click', fresh.action)
      await tool('fill', { ...fresh.input, text: 'Current input' })
      await tool('scroll', { ...fresh.scroll, direction: 'down', amount: 96 })
      const image = (await tool('screenshot', fresh.action)).content.find((item: { type: string }) => item.type === 'image')
      expect([...Buffer.from(image.data, 'base64').subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      await expect(selected.page.getByRole('button', { name: 'Reference fixture action', exact: true })).toHaveAttribute('data-count', '1')
      await expect(selected.page.getByRole('textbox', { name: 'Reference fixture input', exact: true })).toHaveValue('Current input')
      expect(await selected.page.locator('#reference-scroll').evaluate(node => node.scrollTop)).toBe(96)
      expect(await selected.application.evaluate(() => (globalThis as unknown as { __CUI_REF_CAPTURE__: { calls: number } }).__CUI_REF_CAPTURE__.calls)).toBe(1)
      await command('close')
    } finally { await hooks.get('session_shutdown')() }
  })
}

for (const kind of ['children', 'label-ids']) for (const count of [32, 33]) {
  test(`CUI-2 snapshot reports ${kind} scan limit at ${count}`, async () => {
    const f = await launch(path.join(output, 'main/index.js'))
    await f.page.evaluate(({ kind, count }) => {
      const paragraph = document.createElement('p'); paragraph.id = 'scan-subject'
      paragraph.style.cssText = 'position:fixed;left:40px;top:100px;width:600px;height:100px'
      if (kind === 'children') {
        for (let index = 0; index < count; index += 1) paragraph.append(document.createTextNode('x'))
        document.body.replaceChildren(paragraph)
      } else {
        const labels = document.createElement('div'); labels.hidden = true
        for (let index = 0; index < count; index += 1) {
          const label = document.createElement('span'); label.id = `scan-label-${index}`; label.textContent = String(index); labels.append(label)
        }
        paragraph.setAttribute('aria-labelledby', Array.from({ length: count }, (_, i) => `scan-label-${i}`).join(' '))
        document.body.replaceChildren(labels, paragraph)
      }
    }, { kind, count })
    const ui = await connectDevelopmentTarget((await discoverDevelopmentTargets({ directory: f.registry }))[0], { directory: f.registry, session: 'scan-boundary-pane' })
    try {
      const snapshot = (await ui.request('snapshot')).value
      expect(snapshot.nodes.find((node: { tag: string }) => node.tag === 'p')).toMatchObject({
        name: kind === 'children' ? 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' : '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31',
      })
      expect(snapshot.truncated).toBe(count === 33)
    } finally { await ui.close() }
  })
}

test('CUI-2 exact text budget is complete only without an omitted child', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const ui = await connectDevelopmentTarget((await discoverDevelopmentTargets({ directory: f.registry }))[0], { directory: f.registry, session: 'text-boundary-pane' })
  try {
    for (const extra of [false, true]) {
      await f.page.evaluate(extra => {
        const paragraph = document.createElement('p'); paragraph.style.cssText = 'position:fixed;left:40px;top:100px;width:600px;height:100px'
        paragraph.append(document.createTextNode('a'.repeat(4096)))
        if (extra) paragraph.append(document.createTextNode('tail'))
        document.body.replaceChildren(paragraph)
      }, extra)
      const snapshot = (await ui.request('snapshot')).value
      expect(snapshot.nodes.find((node: { tag: string }) => node.tag === 'p')).toMatchObject({ name: 'a'.repeat(4096) })
      expect(snapshot.truncated).toBe(extra)
    }
  } finally { await ui.close() }
})

test('the real snapshot reports its bounded result instead of inventing a complete document', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.page.evaluate(() => {
    const region = document.createElement('div'); region.style.cssText = 'position:fixed;top:80px;left:80px;height:120px;width:200px;overflow:auto'
    for (let index = 0; index < 2100; index += 1) {
      const row = document.createElement('div'); row.textContent = `Literal development node ${index}`; region.append(row)
    }
    document.body.append(region)
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'bounded-ui-pane' })
  try {
    const snapshot = (await ui.request('snapshot')).value
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.nodes).toHaveLength(2000)
    expect(snapshot.nodes.some((item: { name: string }) => item.name === 'Literal development node 0')).toBe(true)
    expect(snapshot.nodes.some((item: { name: string }) => item.name === 'Literal development node 2099')).toBe(false)
  } finally { await ui.close() }
})

test('actual frontend failures retain source locations without cross-window or old-connection delivery', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.page.evaluate("console.error('before-connection-console'); //# sourceURL=cnc-before.js")
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  expect(target.capabilities).toContain('diagnostics')
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'diagnostic-pane' })
  try {
    expect((await ui.request('console')).value.items.some((item: { message: string }) => item.message.includes('before-connection-console'))).toBe(false)
    await f.page.evaluate("console.error('selected-native-console'); //# sourceURL=cnc-selected-console.js")
    await f.page.evaluate("setTimeout(() => { throw new Error('selected-native-exception') }, 0); //# sourceURL=cnc-selected-exception.js")
    await f.page.evaluate(async () => { await fetch('https://cnc-development-fixture.invalid/failed-request', { method: 'POST',
      headers: { 'X-Synthetic-Private': 'do-not-project-header' }, body: 'do-not-project-body' }).catch(() => {}) })
    const missing = await f.page.evaluate(async () => {
      const url = new URL('__cnc_missing_network_fixture__.txt', location.href).href
      try { await fetch(url) } catch { /* This owned missing resource must fail. */ }
      return url
    })
    await expect.poll(async () => (await ui.request('exceptions')).value.items.some((item: { message: string }) => item.message.includes('selected-native-exception'))).toBe(true)
    await expect.poll(async () => (await ui.request('network')).value.items.some((item: { source?: string }) => item.source === missing)).toBe(true)
    const consoleResult = (await ui.request('console')).value
    expect(consoleResult.items.some((item: { message: string }) => item.message.includes('https://cnc-development-fixture.invalid/failed-request') && item.message.includes('Content Security Policy'))).toBe(true)
    expect(consoleResult.items.find((item: { message: string }) => item.message === 'selected-native-console'))
      .toMatchObject({ kind: 'console', source: 'cnc-selected-console.js', line: 1 })
    const exceptions = (await ui.request('exceptions')).value
    expect(exceptions.items.find((item: { message: string }) => item.message.includes('selected-native-exception')))
      .toMatchObject({ kind: 'exception', source: 'cnc-selected-exception.js', line: 1 })
    const network = (await ui.request('network')).value
    expect(network.items.find((item: { source?: string }) => item.source === missing))
      .toMatchObject({ kind: 'network', resourceType: 'Fetch', message: expect.any(String) })
    expect(JSON.stringify(network)).not.toContain('do-not-project-')
    await f.application.evaluate(async ({ BrowserWindow }) => {
      const other = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
      try {
        await other.loadURL('data:text/html,<title>Other owned diagnostic fixture</title>')
        await other.webContents.executeJavaScript("console.error('other-window-console')")
      } finally { other.close() }
    })
    expect((await ui.request('console')).value.items.some((item: { message: string }) => item.message.includes('other-window-console'))).toBe(false)
    await ui.request('console', { clear: true })
    expect((await ui.request('console')).value).toEqual({ items: [], truncated: false })
  } finally { await ui.close() }
  await f.page.evaluate("console.error('after-disconnect-console'); //# sourceURL=cnc-after.js")
  const fresh = await connectDevelopmentTarget(target, { directory: f.registry, session: 'fresh-diagnostic-pane' })
  try {
    expect((await fresh.request('console')).value.items.some((item: { message: string }) => /before-connection-console|selected-native-console|other-window-console|after-disconnect-console/.test(item.message))).toBe(false)
    await f.page.evaluate("console.error('fresh-current-console'); //# sourceURL=cnc-fresh.js")
    expect((await fresh.request('console')).value.items.find((item: { message: string }) => item.message === 'fresh-current-console'))
      .toMatchObject({ source: 'cnc-fresh.js', line: 1 })
  } finally { await fresh.close() }
})

test('explicit native window and element PNGs verify owned bytes while text operations capture nothing', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents
    const original = contents.capturePage
    const state = { calls: 0, fail: false, restore: () => { contents.capturePage = original } }
    contents.capturePage = async (rect, options) => {
      state.calls += 1
      if (state.fail) throw new Error('Owned native capture failure')
      return original.call(contents, rect, options)
    }
    ;(globalThis as unknown as { __CNC_TEST_CAPTURE__: typeof state }).__CNC_TEST_CAPTURE__ = state
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  expect(target.capabilities).toContain('screenshot')
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'capture-proof-pane' })
  try {
    await ui.request('status'); await ui.request('snapshot'); await ui.request('console'); await ui.request('exceptions'); await ui.request('network')
    expect(await f.application.evaluate(() => (globalThis as unknown as { __CNC_TEST_CAPTURE__: { calls: number } }).__CNC_TEST_CAPTURE__.calls)).toBe(0)
    const windowShot = (await ui.request('screenshot')).value
    const windowBytes = await readVerifiedImage(windowShot.image, ui.binding.connection)
    expect(windowBytes.length).toBe(windowShot.image.bytes)
    expect(windowShot.image).toMatchObject({ mime: 'image/png', width: Math.round(windowShot.viewport.width * windowShot.viewport.dpr),
      height: Math.round(windowShot.viewport.height * windowShot.viewport.dpr) })
    const retained = path.join(output, `verified-window-${path.basename(f.root)}.png`)
    await fs.writeFile(retained, windowBytes, { mode: 0o600 })
    await fs.writeFile(path.join(output, 'window-image-proof.json'), JSON.stringify({ retained, image: windowShot.image,
      connection: ui.binding.connection, viewport: windowShot.viewport }, null, 2), { mode: 0o600 })
    await f.page.evaluate(() => {
      const element = document.createElement('div'); element.setAttribute('role', 'region'); element.setAttribute('aria-label', 'Native capture region')
      element.style.cssText = 'position:fixed;left:100px;top:180px;width:120px;height:80px;background:var(--surface-elevated);z-index:1000'
      document.body.append(element)
    })
    const snapshot = (await ui.request('snapshot')).value
    const node = snapshot.nodes.find((item: { name: string }) => item.name === 'Native capture region')
    const crop = (await ui.request('screenshot', { ref: node.ref, revision: snapshot.revision })).value
    const cropBytes = await readVerifiedImage(crop.image, ui.binding.connection)
    expect(crop.image).toMatchObject({ width: 120 * snapshot.viewport.dpr, height: 80 * snapshot.viewport.dpr, mime: 'image/png' })
    expect(crop.image.width).toBeLessThan(windowShot.image.width); expect(crop.image.height).toBeLessThan(windowShot.image.height)
    await fs.writeFile(path.join(output, `verified-element-${path.basename(f.root)}.png`), cropBytes, { mode: 0o600 })
    await ui.request('snapshot')
    await expect(ui.request('screenshot', { ref: node.ref, revision: snapshot.revision })).rejects.toMatchObject({ code: 'STALE_REFERENCE' })
    expect(await f.application.evaluate(() => (globalThis as unknown as { __CNC_TEST_CAPTURE__: { calls: number } }).__CNC_TEST_CAPTURE__.calls)).toBe(2)
    await f.application.evaluate(() => { (globalThis as unknown as { __CNC_TEST_CAPTURE__: { fail: boolean } }).__CNC_TEST_CAPTURE__.fail = true })
    await expect(ui.request('screenshot')).rejects.toMatchObject({ code: 'OPERATION_FAILED', outcome: 'failed' })
    expect((await fs.readdir(path.dirname(windowShot.image.path))).filter(name => name.endsWith('.png'))).toHaveLength(2)
    expect(await ownedImageRemovalCandidates([windowShot.image, crop.image], ui.binding.connection)).toEqual([
      { path: windowShot.image.path, bytes: windowBytes.length, sha256: windowShot.image.sha256, removalAuthorized: false },
      { path: crop.image.path, bytes: cropBytes.length, sha256: crop.image.sha256, removalAuthorized: false },
    ])
    await ui.close()
    expect(await readVerifiedImage(windowShot.image, ui.binding.connection)).toEqual(windowBytes)
    await expect(f.page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  } finally {
    await ui.close()
    await f.application.evaluate(() => {
      const root = globalThis as unknown as { __CNC_TEST_CAPTURE__?: { restore: () => void } }
      root.__CNC_TEST_CAPTURE__?.restore(); delete root.__CNC_TEST_CAPTURE__
    })
  }
})

test('attached keyboard None selection suppresses product actions and returns one literal note after restoration', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents
    const original = contents.capturePage
    const state = { calls: 0, restore: () => { contents.capturePage = original } }
    contents.capturePage = async (rect, options) => { state.calls += 1; return original.call(contents, rect, options) }
    ;(globalThis as unknown as { __CNC_TEST_NONE_CAPTURE__: typeof state }).__CNC_TEST_NONE_CAPTURE__ = state
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const events: any[] = []
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'none-picker-pane', onEvent: (event: unknown) => events.push(event) })
  await f.page.getByRole('textbox', { name: 'Message composer', exact: true }).fill('Synthetic annotation draft')
  const settings = f.page.getByRole('button', { name: 'Settings', exact: true })
  await settings.evaluate(node => { node.setAttribute('data-product-activations', '0'); node.addEventListener('click', () => node.setAttribute('data-product-activations', '1')) })
  await settings.focus()
  const readSelection = () => {
    const value = getSelection()
    return { anchorText: value?.anchorNode?.textContent, anchorOffset: value?.anchorOffset,
      focusText: value?.focusNode?.textContent, focusOffset: value?.focusOffset }
  }
  const expectedSelection = { anchorText: 'Synthetic annotation draft', anchorOffset: 26, focusText: 'Synthetic annotation draft', focusOffset: 26 }
  try {
    expect(await f.page.evaluate(readSelection)).toEqual(expectedSelection)
    expect((await ui.request('annotate', { mode: 'none' })).value).toMatchObject({ state: 'picker-active', mode: 'none' })
    await expect(f.page.locator('#pi-panel')).toBeVisible()
    await expect(ui.request('key', { key: 'Enter' })).rejects.toMatchObject({ code: 'BUSY' })
    await expect(settings).toBeFocused()
    await f.page.keyboard.press('Space')
    await expect(f.page.locator('.pi-note-card')).toHaveCount(1)
    await expect(settings).toHaveAttribute('data-product-activations', '0')
    await expect(f.page.getByRole('dialog')).toHaveCount(0)
    await f.page.locator('.pi-note-textarea').fill('Literal local UI note: const path = "/tmp/not-executed";')
    await f.page.getByRole('button', { name: 'Show element details', exact: true }).click()
    await expect(f.page.getByRole('region', { name: 'Selected element details' })).toContainText('button')
    await f.page.getByRole('button', { name: 'Minimize annotation', exact: true }).click()
    await expect(f.page.locator('.pi-note-textarea')).toBeHidden()
    await f.page.getByRole('button', { name: 'Expand annotation', exact: true }).click()
    await f.page.getByRole('button', { name: 'Delete annotation', exact: true }).click()
    await expect(f.page.locator('.pi-note-card')).toHaveCount(0)
    await f.page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    await expect(f.page.locator('.pi-note-textarea')).toHaveValue('Literal local UI note: const path = "/tmp/not-executed";')
    await f.page.getByRole('button', { name: 'Hide annotations', exact: true }).click()
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(1)
    const result = events.find(event => event.kind === 'annotation')
    expect(result).toMatchObject({ outcome: 'submitted', mode: 'none', request: expect.any(String),
      notes: [{ tag: 'button', name: 'Settings', comment: 'Literal local UI note: const path = "/tmp/not-executed";' }] })
    expect(result.notes[0]).not.toHaveProperty('image')
    expect(await f.application.evaluate(() => (globalThis as unknown as { __CNC_TEST_NONE_CAPTURE__: { calls: number } }).__CNC_TEST_NONE_CAPTURE__.calls)).toBe(0)
    await expect(f.page.locator('#pi-panel')).toHaveCount(0)
    await expect(f.page.locator('.pi-note-card')).toHaveCount(0)
    await expect(settings).toBeFocused()
    expect(await f.page.evaluate(readSelection)).toEqual(expectedSelection)
    await expect(f.page.getByRole('textbox', { name: 'Message composer', exact: true })).toHaveText('Synthetic annotation draft')
    expect((await ui.request('status')).value).toEqual({ state: 'connected-idle' })
  } finally {
    await pickerEvidence(f.application, f.root, ui.binding.connection, events)
    await ui.close()
    await f.application.evaluate(() => {
      const root = globalThis as unknown as { __CNC_TEST_NONE_CAPTURE__?: { restore: () => void } }
      root.__CNC_TEST_NONE_CAPTURE__?.restore(); delete root.__CNC_TEST_NONE_CAPTURE__
    })
  }
})

test('attached Crop saves only canonical crops and camera-off annotation adds no native capture', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents
    const original = contents.capturePage
    const state = { calls: 0, restore: () => { contents.capturePage = original } }
    contents.capturePage = async (rect, options) => { state.calls += 1; return original.call(contents, rect, options) }
    ;(globalThis as unknown as { __CNC_TEST_PICKER_CAPTURE__: typeof state }).__CNC_TEST_PICKER_CAPTURE__ = state
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const events: any[] = []
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'crop-picker-pane', onEvent: (event: unknown) => events.push(event) })
  try {
    await ui.request('annotate', { mode: 'crop' })
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(f.page.locator('.pi-note-card')).toHaveCount(1)
    await f.page.locator('.pi-note-textarea').fill('Crop this development control.')
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(1)
    const first = events.find(event => event.kind === 'annotation')
    expect(first).toMatchObject({ outcome: 'submitted', mode: 'crop', notes: [{ comment: 'Crop this development control.', image: { mime: 'image/png' } }] })
    const bytes = await readVerifiedImage(first.notes[0].image, ui.binding.connection)
    expect(bytes.length).toBe(first.notes[0].image.bytes)
    await fs.writeFile(path.join(output, 'verified-attached-note-crop.png'), bytes, { mode: 0o600 })
    expect(await f.application.evaluate(() => (globalThis as unknown as { __CNC_TEST_PICKER_CAPTURE__: { calls: number } }).__CNC_TEST_PICKER_CAPTURE__.calls)).toBe(1)
    await ui.request('annotate', { mode: 'crop' })
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await f.page.locator('.pi-note-screenshot').click()
    await f.page.locator('.pi-note-textarea').fill('Camera off retains a literal note.')
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(2)
    const second = events.filter(event => event.kind === 'annotation')[1]
    expect(second).toMatchObject({ outcome: 'submitted', mode: 'none', notes: [{ comment: 'Camera off retains a literal note.' }] })
    expect(second.notes[0]).not.toHaveProperty('image')
    expect(await f.application.evaluate(() => (globalThis as unknown as { __CNC_TEST_PICKER_CAPTURE__: { calls: number } }).__CNC_TEST_PICKER_CAPTURE__.calls)).toBe(1)
    expect((await ui.request('status')).value).toEqual({ state: 'connected-idle' })
  } finally {
    await pickerEvidence(f.application, f.root, ui.binding.connection, events)
    await ui.close()
    await f.application.evaluate(() => {
      const root = globalThis as unknown as { __CNC_TEST_PICKER_CAPTURE__?: { restore: () => void } }
      root.__CNC_TEST_PICKER_CAPTURE__?.restore(); delete root.__CNC_TEST_PICKER_CAPTURE__
    })
  }
})

test('attached mixed screenshot choices capture only notes that request crops', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents
    const original = contents.capturePage
    const state = { calls: 0, restore: () => { contents.capturePage = original } }
    contents.capturePage = async (rect, options) => { state.calls += 1; return original.call(contents, rect, options) }
    ;(globalThis as unknown as { __CNC_TEST_MIXED_CAPTURE__: typeof state }).__CNC_TEST_MIXED_CAPTURE__ = state
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const events: any[] = []
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'mixed-note-capture', onEvent: (event: unknown) => events.push(event) })
  try {
    await ui.request('annotate', { mode: 'none' })
    await expect(f.page.getByRole('button', { name: 'Select an element', exact: true })).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['Settings', 'Files']) await f.page.getByRole('button', { name, exact: true }).click()
    const notes = f.page.locator('.pi-note-card')
    await expect(notes).toHaveCount(2)
    await notes.nth(0).locator('.pi-note-screenshot').click()
    await expect(notes.nth(1).getByRole('button', { name: 'Add screenshot', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(notes.nth(0).locator('.pi-note-screenshot')).toHaveAttribute('aria-pressed', 'true')
    await expect(notes.nth(1).locator('.pi-note-screenshot')).toHaveAttribute('aria-pressed', 'false')
    await notes.nth(0).locator('.pi-note-textarea').fill('Capture the Settings control.')
    await notes.nth(1).locator('.pi-note-textarea').fill('Do not capture the Files control.')
    await notes.nth(0).getByRole('button', { name: 'Delete annotation', exact: true }).click()
    await f.page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    await expect(notes.nth(0).getByRole('button', { name: 'Remove screenshot', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await f.page.getByRole('button', { name: 'Redo annotation change', exact: true }).click()
    await expect(notes).toHaveCount(1)
    await f.page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    await expect(notes).toHaveCount(2)
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(1)
    const event = events.find(value => value.kind === 'annotation')
    expect(event).toMatchObject({ outcome: 'submitted', mode: 'crop', notes: [
      { name: 'Settings', comment: 'Capture the Settings control.', image: { mime: 'image/png' } },
      { name: 'Files', comment: 'Do not capture the Files control.' },
    ] })
    expect(event.notes[1]).not.toHaveProperty('image')
    const bytes = await readVerifiedImage(event.notes[0].image, ui.binding.connection)
    expect(bytes.length).toBe(event.notes[0].image.bytes)
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(await f.application.evaluate(() => (globalThis as unknown as { __CNC_TEST_MIXED_CAPTURE__: { calls: number } }).__CNC_TEST_MIXED_CAPTURE__.calls)).toBe(1)
  } finally {
    await pickerEvidence(f.application, f.root, ui.binding.connection, events)
    await ui.close()
    await f.application.evaluate(() => {
      const root = globalThis as unknown as { __CNC_TEST_MIXED_CAPTURE__?: { restore: () => void } }
      root.__CNC_TEST_MIXED_CAPTURE__?.restore(); delete root.__CNC_TEST_MIXED_CAPTURE__
    })
  }
})

test('attached Crop defaults a later note to a crop after the first note opts out', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents
    const original = contents.capturePage
    const state = { calls: 0, restore: () => { contents.capturePage = original } }
    contents.capturePage = async (rect, options) => { state.calls += 1; return original.call(contents, rect, options) }
    ;(globalThis as unknown as { __CNC_TEST_LATE_CAPTURE__: typeof state }).__CNC_TEST_LATE_CAPTURE__ = state
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const events: any[] = []
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'late-crop-note', onEvent: (event: unknown) => events.push(event) })
  try {
    await ui.request('annotate', { mode: 'crop' })
    await expect(f.page.getByRole('button', { name: 'Select an element', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    const notes = f.page.locator('.pi-note-card')
    await expect(notes).toHaveCount(1)
    const first = notes.nth(0).locator('.pi-note-screenshot')
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await f.page.getByRole('button', { name: 'Files', exact: true }).click()
    await expect(notes).toHaveCount(2)
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await expect(notes.nth(1).locator('.pi-note-screenshot')).toHaveAttribute('aria-pressed', 'true')
    await f.page.locator('.pi-note-textarea').nth(0).fill('Do not capture the Settings control.')
    await f.page.locator('.pi-note-textarea').nth(1).fill('Capture the Files control.')
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(1)
    const event = events.find(value => value.kind === 'annotation')
    expect(event).toMatchObject({ outcome: 'submitted', mode: 'crop', notes: [
      { name: 'Settings', comment: 'Do not capture the Settings control.' },
      { name: 'Files', comment: 'Capture the Files control.', image: { mime: 'image/png' } },
    ] })
    expect(event.notes[0]).not.toHaveProperty('image')
    const bytes = await readVerifiedImage(event.notes[1].image, ui.binding.connection)
    expect(bytes.length).toBe(event.notes[1].image.bytes)
    expect(await f.application.evaluate(() => (globalThis as unknown as { __CNC_TEST_LATE_CAPTURE__: { calls: number } }).__CNC_TEST_LATE_CAPTURE__.calls)).toBe(1)
  } finally {
    await pickerEvidence(f.application, f.root, ui.binding.connection, events)
    await ui.close()
    await f.application.evaluate(() => {
      const root = globalThis as unknown as { __CNC_TEST_LATE_CAPTURE__?: { restore: () => void } }
      root.__CNC_TEST_LATE_CAPTURE__?.restore(); delete root.__CNC_TEST_LATE_CAPTURE__
    })
  }
})

test('native cancellation preserves request identity and disconnect permits a fresh picker in the same window', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const events: any[] = []
  const first = await connectDevelopmentTarget(target, { directory: f.registry, session: 'first-cancel-pane', onEvent: (event: unknown) => events.push(event) })
  try {
    const annotation = (await first.request('annotate', { mode: 'none' })).value.annotation
    await expect(first.request('annotate', { mode: 'crop' })).rejects.toMatchObject({ code: 'BUSY', outcome: 'refused' })
    await f.page.keyboard.press('Escape')
    await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(1)
    expect(events.find(event => event.kind === 'annotation')).toMatchObject({ request: annotation, outcome: 'cancelled', mode: 'none', notes: [] })
    expect(first.annotationRequest).toBeUndefined()
    await expect(f.page.locator('#pi-panel')).toHaveCount(0)
    const closing = first.close(); expect(first.close()).toBe(closing); await closing
    expect(await f.application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScriptInIsolatedWorld(1004,
      [{ code: 'Object.hasOwn(window,"__CNC_DEV_PICKER__") || Object.hasOwn(window,"__piAnnotate_cnc-attached-development")' }]))).toBe(false)
  } finally { await first.close() }
  const second = await connectDevelopmentTarget(target, { directory: f.registry, session: 'fresh-cancel-pane' })
  try {
    const annotation = (await second.request('annotate', { mode: 'crop' })).value.annotation
    await expect(f.page.locator('#pi-panel')).toBeVisible()
    expect((await second.request('cancel', { annotation })).value).toEqual({ state: 'connected-idle' })
    await second.close()
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect(f.page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  } finally { await second.close() }
})

test('closing the actual picker X permits connect to resume the same live app connection', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const commands = new Map<string, any>(), tools = new Map<string, any>(), hooks = new Map<string, any>()
  const messages: any[] = [], notices: any[] = []
  const counts = { discover: 0, connect: 0 }
  const pi = { registerCommand: (name: string, value: any) => commands.set(name, value), registerTool: (value: any) => tools.set(value.name, value),
    on: (name: string, value: any) => hooks.set(name, value), sendUserMessage: (content: any, options: any) => messages.push({ content, options }) }
  const state = { epoch: 0, slots: new Map<string, any>() }
  const development = installDevelopmentAdapter(pi, { schema: {}, state,
    discover: () => { counts.discover += 1; return discoverDevelopmentTargets({ directory: f.registry }) },
    connect: (target, options) => { counts.connect += 1; return connectDevelopmentTarget(target, { ...options, directory: f.registry }) } })
  installAnnotationAdapter(pi, { schema: {}, development, state: { epoch: 0, slots: new Map() },
    createLaunch: async () => { throw new Error('Resume must not create a synthetic app') } })
  const ctx = { hasUI: true, sessionManager: { getSessionId: () => 'picker-resume-pane' }, ui: {
    select: async () => { throw new Error('Resume must not choose another window') }, confirm: async () => false,
    notify: (message: string, type: string) => notices.push({ message, type }) } }
  const command = (action: string) => commands.get('annotate-electron').handler(action, ctx)
  const status = async () => JSON.parse((await tools.get('electron_ui').execute('call', { action: 'status' }, undefined, undefined, ctx)).content[0].text)
  await f.page.getByRole('textbox', { name: 'Message composer', exact: true }).fill('Synthetic resume draft')
  try {
    await command('connect')
    await expect(f.page.locator('#pi-panel')).toBeVisible()
    const binding = { ...state.slots.get('picker-resume-pane').client.binding }
    const firstRequest = state.slots.get('picker-resume-pane').request
    await f.page.locator('#pi-close').click()
    await expect.poll(async () => (await status()).state).toBe('connected-idle')
    await expect.poll(() => notices.some(item => item.message === 'Annotation cancelled. The app connection remains open.')).toBe(true)
    await expect(f.page.locator('#pi-panel')).toHaveCount(0)
    await command('connect')
    await expect(f.page.locator('#pi-panel')).toBeVisible()
    expect((await status()).state).toBe('picker-active')
    expect(state.slots.get('picker-resume-pane').client.binding).toEqual(binding)
    const resumedRequest = state.slots.get('picker-resume-pane').request
    expect(resumedRequest).not.toBe(firstRequest)
    await command('connect')
    expect(notices.at(-1)).toEqual({ type: 'info', message: 'The annotation picker is already active. The selected development window is unchanged.' })
    expect(state.slots.get('picker-resume-pane').request).toBe(resumedRequest)
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await f.page.locator('.pi-note-textarea').fill('Annotation after closing and resuming the picker')
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => messages.length).toBe(1)
    expect(messages[0].content[0].text).toContain('Annotation after closing and resuming the picker')
    expect(messages[0].options).toEqual({ deliverAs: 'followUp', expandPromptTemplates: false })
    expect(messages[0].content.filter((item: { type: string }) => item.type === 'image')).toEqual([])
    expect(counts).toEqual({ discover: 1, connect: 1 })
    await expect(f.page.getByRole('textbox', { name: 'Message composer', exact: true })).toHaveText('Synthetic resume draft')
    await command('disconnect')
    expect(state.slots.size).toBe(0)
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ destroyed: window.isDestroyed(), visible: window.isVisible() }))))
      .toEqual([{ destroyed: false, visible: false }])
  } finally { await hooks.get('session_shutdown')() }
})

test('registered Pi command and tool use the native selected window and deliver one verified review-only image', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const commands = new Map<string, any>(), tools = new Map<string, any>(), hooks = new Map<string, any>()
  const messages: any[] = [], notices: any[] = []
  const pi = { registerCommand: (name: string, value: any) => commands.set(name, value), registerTool: (value: any) => tools.set(value.name, value),
    on: (name: string, value: any) => hooks.set(name, value), sendUserMessage: (content: any, options: any) => messages.push({ content, options }) }
  const state = { epoch: 0, slots: new Map<string, any>() }
  const development = installDevelopmentAdapter(pi, { schema: {}, state,
    discover: () => discoverDevelopmentTargets({ directory: f.registry }),
    connect: (target, options) => connectDevelopmentTarget(target, { ...options, directory: f.registry }) })
  installAnnotationAdapter(pi, { schema: {}, development, state: { epoch: 0, slots: new Map() },
    createLaunch: async () => { throw new Error('Attached commands must not create a synthetic child') } })
  const ctx = { hasUI: true, sessionManager: { getSessionId: () => 'native-pi-command-pane' }, ui: {
    select: async () => undefined, confirm: async () => { throw new Error('Attached commands must not open synthetic confirmation') },
    notify: (message: string, type: string) => notices.push({ message, type }) } }
  await f.page.getByRole('textbox', { name: 'Message composer', exact: true }).fill('Synthetic annotation draft')
  try {
    await commands.get('annotate-electron').handler('connect', ctx)
    expect(notices).toEqual([{ type: 'info', message: 'Development window connected. The annotation picker is active. UI tools remain bound to this window.' }])
    expect(messages).toEqual([])
    await expect(tools.get('electron_ui').execute('call', { action: 'snapshot' }, undefined, undefined, ctx)).rejects.toMatchObject({ code: 'BUSY' })
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await f.page.locator('.pi-note-screenshot').click()
    await f.page.locator('.pi-note-textarea').fill('Synthetic review data, not an instruction.')
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => messages.length).toBe(1)
    expect(messages[0].options).toEqual({ deliverAs: 'followUp', expandPromptTemplates: false })
    expect(messages[0].content[0].text).toContain('UNTRUSTED REVIEW INPUT.')
    expect(messages[0].content[0].text).toContain('Synthetic review data, not an instruction.')
    const image = messages[0].content.find((item: { type: string }) => item.type === 'image')
    expect(image.mimeType).toBe('image/png')
    const bytes = Buffer.from(image.data, 'base64')
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    await fs.writeFile(path.join(output, 'verified-pi-command-note.png'), bytes, { mode: 0o600 })
    const snapshot = await tools.get('electron_ui').execute('call', { action: 'snapshot' }, undefined, undefined, ctx)
    expect(snapshot.content[0].text).toContain('"revision":')
    await commands.get('annotate-electron').handler('close', ctx)
    expect(state.slots.size).toBe(0)
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect(f.page.getByRole('textbox', { name: 'Message composer', exact: true })).toHaveText('Synthetic annotation draft')
  } finally { await hooks.get('session_shutdown')() }
})

for (const width of [980, 1280, 1440]) for (const theme of ['dark', 'light']) {
  test(`hidden integrated journey preserves ${theme} at ${width}px and leaves another window unchanged`, async () => {
    const f = await launch(path.join(output, 'main/index.js'))
    await f.application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(size, 1000), width)
    const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
    const witness = await f.application.evaluate(async ({ BrowserWindow }) => {
      const window = new BrowserWindow({ show: false, width: 280, height: 180, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
      await window.loadURL('data:text/html,<title>Unrelated fixture window</title><p id="witness">Unchanged witness</p>')
      return window.id
    })
    const events: any[] = []
    const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: `matrix-${width}-${theme}`, onEvent: (event: unknown) => events.push(event) })
    async function ref(role: string, name: string) {
      const snapshot = (await ui.request('snapshot')).value
      const node = snapshot.nodes.find((item: { role: string; name: string }) => item.role === role && item.name === name)
      expect(node, `Missing ${role} ${name}`).toBeTruthy()
      return { ref: node.ref, revision: snapshot.revision }
    }
    try {
      await ui.request('fill', { ...await ref('textbox', 'Message composer'), text: 'Synthetic annotation draft' })
      await ui.request('click', await ref('button', 'Settings'))
      if (theme === 'light') await ui.request('click', await ref('switch', 'Light color scheme'))
      await expect(f.page.locator('body')).toHaveAttribute('data-preview-color-scheme', theme)
      await expect(f.page.locator('.main-content-safe-area')).toHaveCSS('background-color', theme === 'light' ? 'rgb(253, 252, 250)' : 'rgb(18, 15, 14)')
      const control = f.page.getByRole('switch', { name: 'Light color scheme', exact: true })
      await control.focus()
      await ui.request('annotate', { mode: 'none' })
      await f.page.keyboard.press('Space')
      await expect(f.page.locator('.pi-note-card')).toHaveCount(1)
      await f.page.locator('.pi-note-textarea').fill(`Synthetic ${theme} ${width}px note`)
      await expect(f.page.getByRole('toolbar', { name: 'Electron Annotate' })).toBeVisible()
      await expect(f.page.locator('.pi-note-screenshot')).toHaveAttribute('aria-pressed', 'false')
      await f.page.screenshot({ path: path.join(output, `annotation-toolbar-${width}-${theme}.png`) })
      await f.page.locator('#pi-submit').click()
      await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(1)
      expect(events.find(event => event.kind === 'annotation')).toMatchObject({ outcome: 'submitted', mode: 'none', notes: [{ comment: `Synthetic ${theme} ${width}px note` }] })
      await expect(control).toBeFocused()
      await expect(f.page.getByRole('dialog')).toBeVisible()
      await expect(f.page.locator('body')).toHaveAttribute('data-preview-color-scheme', theme)
      await ui.request('annotate', { mode: 'none' })
      await f.page.keyboard.press('Escape')
      await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(2)
      expect(events.filter(event => event.kind === 'annotation')[1]).toMatchObject({ outcome: 'cancelled', notes: [] })
      await f.page.evaluate(() => {
        console.error('Matrix frontend console error')
        setTimeout(() => { throw new Error('Matrix frontend exception') }, 0)
        const image = document.createElement('img'); image.src = `${location.origin}/matrix-missing-image.png`; document.body.append(image)
      })
      await expect.poll(async () => JSON.stringify((await ui.request('console')).value)).toContain('Matrix frontend console error')
      await expect.poll(async () => JSON.stringify((await ui.request('exceptions')).value)).toContain('Matrix frontend exception')
      await expect.poll(async () => JSON.stringify((await ui.request('network')).value)).toContain('matrix-missing-image.png')
      const shot = (await ui.request('screenshot')).value
      expect(shot.viewport.width).toBe(width)
      await fs.writeFile(path.join(output, `matrix-${width}-${theme}.png`), await readVerifiedImage(shot.image, ui.binding.connection), { mode: 0o600 })
      await ui.close()
      await expect(f.page.getByRole('dialog')).toBeVisible()
      await expect(f.page.locator('body')).toHaveAttribute('data-preview-color-scheme', theme)
      expect(await f.application.evaluate(async ({ BrowserWindow }, id) => {
        const window = BrowserWindow.fromId(id)!
        return { title: window.getTitle(), visible: window.isVisible(), text: await window.webContents.executeJavaScript('document.getElementById("witness").textContent') }
      }, witness)).toEqual({ title: 'Unrelated fixture window', visible: false, text: 'Unchanged witness' })
      await f.page.getByRole('button', { name: 'Close Settings', exact: true }).click()
      await expect(f.page.getByRole('textbox', { name: 'Message composer', exact: true })).toHaveText('Synthetic annotation draft')
      await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(f.page.getByRole('dialog')).toBeVisible()
    } finally { await ui.close() }
  })
}

test('native cancellation joins an actual pending capture and never delivers its image', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  await f.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents
    const original = contents.capturePage
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const state = { entered: false, release, restore: () => { contents.capturePage = original } }
    contents.capturePage = async (rect, options) => { state.entered = true; await gate; return original.call(contents, rect, options) }
    ;(globalThis as unknown as { __CNC_CAPTURE_CANCEL__: typeof state }).__CNC_CAPTURE_CANCEL__ = state
  })
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0], events: any[] = []
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'capture-cancel-pane', onEvent: (event: unknown) => events.push(event) })
  try {
    const request = (await ui.request('annotate', { mode: 'crop' })).value.annotation
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await f.page.locator('.pi-note-textarea').fill('Synthetic cancelled image')
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => f.application.evaluate(() => (globalThis as unknown as { __CNC_CAPTURE_CANCEL__: { entered: boolean } }).__CNC_CAPTURE_CANCEL__.entered)).toBe(true)
    let finished = false
    const cancelling = ui.request('cancel', { annotation: request }).then((value: unknown) => { finished = true; return value })
    void cancelling.catch(() => {})
    await expect(ui.request('status')).rejects.toMatchObject({ code: 'BUSY', outcome: 'refused' })
    await f.application.evaluate(() => true)
    expect(finished).toBe(false)
    expect(events.filter(event => event.kind === 'annotation')).toEqual([])
    await f.application.evaluate(() => (globalThis as unknown as { __CNC_CAPTURE_CANCEL__: { release(): void } }).__CNC_CAPTURE_CANCEL__.release())
    await cancelling
    await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(1)
    expect(events.find(event => event.kind === 'annotation')).toMatchObject({ outcome: 'cancelled', notes: [] })
    await expect(f.page.locator('#pi-panel')).toHaveCount(0)
    expect((await ui.request('status')).value).toEqual({ state: 'connected-idle' })
  } finally {
    await f.application.evaluate(() => { const state = (globalThis as unknown as { __CNC_CAPTURE_CANCEL__: { release(): void; restore(): void } }).__CNC_CAPTURE_CANCEL__; state.release(); state.restore() })
    await ui.close()
  }
})

test('a native modal cancels annotation without moving controls into product event paths', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const events: any[] = []
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'native-modal-pane', onEvent: (event: unknown) => events.push(event) })
  try {
    await ui.request('annotate', { mode: 'none' })
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await f.page.getByRole('textbox', { name: 'Feedback', exact: true }).fill('Unsent synthetic feedback.')
    await f.page.evaluate(() => {
      const dialog = document.createElement('dialog'); dialog.id = 'synthetic-native-modal'
      const button = document.createElement('button'); button.textContent = 'Synthetic modal control'
      dialog.addEventListener('click', () => dialog.dataset.activated = 'true', true)
      dialog.addEventListener('input', () => dialog.dataset.activated = 'true', true)
      dialog.append(button); document.body.append(dialog); dialog.showModal(); button.focus()
    })
    await expect.poll(() => events.filter(event => event.kind === 'annotation').length).toBe(1)
    expect(events.find(event => event.kind === 'annotation')).toMatchObject({ outcome: 'cancelled', notes: [] })
    await expect(f.page.locator('#synthetic-native-modal')).toBeVisible()
    await expect(f.page.locator('#synthetic-native-modal')).not.toHaveAttribute('data-activated')
    await expect(f.page.getByRole('button', { name: 'Synthetic modal control', exact: true })).toBeFocused()
    await expect(f.page.locator('[popover],#pi-panel,.pi-note-card')).toHaveCount(0)
    expect((await ui.request('status')).value).toEqual({ state: 'connected-idle' })
    await expect(ui.request('annotate', { mode: 'none' })).rejects.toThrow()
    await expect(f.page.locator('[popover],#pi-panel,.pi-note-card')).toHaveCount(0)
    await f.page.locator('#synthetic-native-modal').evaluate(node => (node as HTMLDialogElement).close())
    await ui.request('annotate', { mode: 'none' })
    await expect(f.page.getByRole('toolbar', { name: 'Electron Annotate' })).toBeVisible()
  } finally { await ui.close() }
})

test('floating dock drag captures native pointer input and releases it for selection', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'dock-drag-pane' })
  const settings = f.page.getByRole('button', { name: 'Settings', exact: true })
  await settings.evaluate(node => { node.setAttribute('data-product-activations', '0'); node.addEventListener('click', () => node.setAttribute('data-product-activations', '1')) })
  try {
    await ui.request('annotate', { mode: 'none' })
    const dock = f.page.locator('#pi-panel'), before = (await dock.boundingBox())!
    await f.page.mouse.move(before.x + 3, before.y + 3)
    await f.page.mouse.down()
    await f.page.mouse.move(before.x - 197, before.y - 297, { steps: 6 })
    await f.page.mouse.up()
    const after = (await dock.boundingBox())!
    expect(after.x).toBeCloseTo(before.x - 200, 0)
    expect(after.y).toBeCloseTo(before.y - 300, 0)
    await expect(dock).not.toHaveClass(/pi-cnc-dragging/)
    await expect(f.page.locator('.pi-note-card')).toHaveCount(0)
    await settings.click()
    await expect(f.page.locator('.pi-note-card')).toHaveCount(1)
    await expect(settings).toHaveAttribute('data-product-activations', '0')
    await expect(f.page.getByRole('dialog')).toHaveCount(0)
    await f.page.getByRole('button', { name: 'Cancel annotation', exact: true }).click()
    await expect(dock).toHaveCount(0)
    await ui.request('annotate', { mode: 'none' })
    expect((await dock.boundingBox())!.y).toBeCloseTo(before.y, 0)
  } finally { await f.page.mouse.up(); await ui.close() }
})

test('owned picker note drag crosses its card boundary without product input or a stuck drag state', async () => {
  const f = await launch(path.join(output, 'main/index.js'))
  const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
  const ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'picker-drag-pane' })
  try {
    await ui.request('annotate', { mode: 'none' })
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    const card = f.page.locator('.pi-note-card'), header = card.locator('.pi-note-header')
    const before = (await card.boundingBox())!, box = (await header.boundingBox())!
    await f.page.mouse.move(box.x + 3, box.y + 3)
    await f.page.mouse.down()
    await expect(card).toHaveClass(/dragging/)
    await f.page.mouse.move(box.x + before.width + 60, box.y - 180, { steps: 6 })
    await f.page.mouse.up()
    expect((await card.boundingBox())!.x).toBeGreaterThan(before.x + before.width)
    await expect(card).not.toHaveClass(/dragging/)
    await expect(f.page.getByRole('dialog')).toHaveCount(0)
  } finally { await f.page.mouse.up(); await ui.close() }
})

test('approved visible walkthrough uses a real offline Pi source session and opens its verified crop', async () => {
  test.skip(process.env.CNC_DEV_UI_VISIBLE_WALKTHROUGH !== '1', 'A visible walkthrough needs its separate approved invocation.')
  test.setTimeout(120_000)
  const f = await launch(path.join(output, 'main/index.js'), { visible: true })
  const previous = process.env.TMPDIR
  process.env.TMPDIR = path.dirname(f.registry)
  let sdk: Awaited<ReturnType<typeof createOfflineAnnotationSession>> | undefined
  await f.application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents, original = contents.capturePage
    const state = { calls: 0, restore: () => { contents.capturePage = original } }
    contents.capturePage = async (rect, options) => { state.calls += 1; return original.call(contents, rect, options) }
    ;(globalThis as unknown as { __CNC_VISIBLE_CAPTURE__: typeof state }).__CNC_VISIBLE_CAPTURE__ = state
  })
  try {
    sdk = await createOfflineAnnotationSession(f.root, { persist: true })
    await f.page.getByRole('textbox', { name: 'Message composer', exact: true }).fill('Synthetic annotation draft')
    await sdk.session.prompt('/annotate-electron connect')
    expect(sdk.notices).toEqual([{ type: 'info', message: 'Development window connected. The annotation picker is active. UI tools remain bound to this window.' }])
    expect(sdk.observation.calls).toBe(0)
    await expect(sdk.run('snapshot')).rejects.toThrow('BUSY')
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await f.page.locator('.pi-note-screenshot').click()
    await f.page.locator('.pi-note-textarea').fill('Synthetic visible crop review. No source changes.')
    const cropResponse = sdk.observation.calls + 1
    sdk.queueText('Synthetic image annotation received. No source changes.')
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => sdk!.observation.calls).toBe(cropResponse)
    await expect.poll(() => sdk!.session.isStreaming).toBe(false)
    const first = sdk.annotationMessages()
    expect(first).toHaveLength(1)
    expect(JSON.stringify(first[0])).toContain('Synthetic visible crop review. No source changes.')
    const image = typeof first[0]!.content === 'string' ? undefined : first[0]!.content.find(item => item.type === 'image')
    expect(image).toMatchObject({ type: 'image', mimeType: 'image/png' })
    if (!image || image.type !== 'image') throw new Error('The real Pi source session did not receive its crop')
    const cropFile = path.join(output, 'visible-real-pi-crop.png')
    const cropBytes = Buffer.from(image.data, 'base64')
    expect([...cropBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    await fs.writeFile(cropFile, cropBytes, { mode: 0o600 })
    async function ref(role: string, name: string) {
      const result = await sdk!.run('snapshot'), text = result.content.find(item => item.type === 'text')
      if (!text || text.type !== 'text') throw new Error('The actual SDK tool returned no snapshot')
      const snapshot = JSON.parse(text.text)
      const node = snapshot.nodes.find((item: { role: string; name: string }) => item.role === role && item.name === name)
      expect(node, `Missing ${role} ${name}`).toBeTruthy()
      return { ref: node.ref, revision: snapshot.revision }
    }
    await sdk.run('click', await ref('button', 'Settings'))
    await expect(f.page.getByRole('dialog')).toBeVisible()
    await sdk.run('click', await ref('switch', 'Light color scheme'))
    await expect(f.page.locator('body')).toHaveAttribute('data-preview-color-scheme', 'light')
    await sdk.run('key', { key: 'Escape' })
    await expect(f.page.getByRole('dialog')).toHaveCount(0)
    const settings = f.page.getByRole('button', { name: 'Settings', exact: true })
    await settings.focus()
    const beforeNone = await f.application.evaluate(() => (globalThis as unknown as { __CNC_VISIBLE_CAPTURE__: { calls: number } }).__CNC_VISIBLE_CAPTURE__.calls)
    await sdk.session.prompt('/annotate-electron none')
    await f.page.keyboard.press('Space')
    await f.page.locator('.pi-note-textarea').fill('Synthetic visible None review. Literal /tmp/not-executed.')
    const noneResponse = sdk.observation.calls + 1
    sdk.queueText('Synthetic text annotation received. No source changes.')
    await f.page.locator('#pi-submit').click()
    await expect.poll(() => sdk!.observation.calls).toBe(noneResponse)
    await expect.poll(() => sdk!.session.isStreaming).toBe(false)
    const users = sdk.annotationMessages()
    expect(users).toHaveLength(2)
    expect(JSON.stringify(users[1])).toContain('Synthetic visible None review. Literal /tmp/not-executed.')
    expect(typeof users[1]!.content === 'string' ? [] : users[1]!.content.filter(item => item.type === 'image')).toEqual([])
    const afterNone = await f.application.evaluate(() => (globalThis as unknown as { __CNC_VISIBLE_CAPTURE__: { calls: number } }).__CNC_VISIBLE_CAPTURE__.calls)
    expect(afterNone - beforeNone).toBe(0)
    await expect(settings).toBeFocused()
    await f.page.evaluate(() => {
      console.error('Visible walkthrough frontend error')
      setTimeout(() => { throw new Error('Visible walkthrough frontend exception') }, 0)
      const image = document.createElement('img'); image.src = `${location.origin}/visible-walkthrough-missing.png`; document.body.append(image)
    })
    await expect.poll(async () => JSON.stringify(await sdk!.run('console'))).toContain('Visible walkthrough frontend error')
    await expect.poll(async () => JSON.stringify(await sdk!.run('exceptions'))).toContain('Visible walkthrough frontend exception')
    await expect.poll(async () => JSON.stringify(await sdk!.run('network'))).toContain('visible-walkthrough-missing.png')
    const transcript = await sdk.session.exportToHtml(path.join(output, 'visible-real-pi-source.html'), { themeName: 'dark' })
    await fs.chmod(transcript, 0o600)
    const sourcePageReady = f.application.waitForEvent('window')
    const sourceId = await f.application.evaluate(async ({ BrowserWindow }, file) => {
      const window = new BrowserWindow({ show: true, width: 1024, height: 840, title: 'Real developer Pi source session',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'offline-pi-source' } })
      window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }))
      await window.loadFile(file); return window.id
    }, transcript)
    const sourcePage = await sourcePageReady
    await expect(sourcePage.getByText('Synthetic visible crop review. No source changes.', { exact: false }).first()).toBeVisible()
    await expect(sourcePage.getByText('Synthetic visible None review. Literal /tmp/not-executed.', { exact: false }).first()).toBeVisible()
    await expect(sourcePage.locator('img[src^="data:image/png;base64,"]')).toHaveCount(1)
    expect(await sourcePage.locator('img[src^="data:image/png;base64,"]').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await sourcePage.screenshot({ path: path.join(output, 'visible-real-pi-source.png') })
    await sourcePage.locator('img[src^="data:image/png;base64,"]').scrollIntoViewIfNeeded()
    await sourcePage.screenshot({ path: path.join(output, 'visible-source-crop-message.png') })
    await sourcePage.getByText('Synthetic visible None review. Literal /tmp/not-executed.', { exact: false }).first().scrollIntoViewIfNeeded()
    await sourcePage.screenshot({ path: path.join(output, 'visible-source-none-message.png') })
    const cropPageReady = f.application.waitForEvent('window')
    const cropId = await f.application.evaluate(async ({ BrowserWindow }, file) => {
      const window = new BrowserWindow({ show: true, width: 420, height: 320, title: 'Verified synthetic annotation crop',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'offline-pi-crop' } })
      await window.loadFile(file); return window.id
    }, cropFile)
    const cropPage = await cropPageReady
    await expect(cropPage.locator('img')).toBeVisible()
    expect(await cropPage.locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await cropPage.screenshot({ path: path.join(output, 'visible-opened-crop.png') })
    expect(await f.application.evaluate(({ BrowserWindow }, ids) => ids.map(id => BrowserWindow.fromId(id)!.isVisible()), [sourceId, cropId])).toEqual([true, true])
    await sdk.session.prompt('/annotate-electron disconnect')
    await expect(f.page.locator('#pi-panel')).toHaveCount(0)
    await f.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(f.page.getByRole('dialog')).toBeVisible()
    await f.page.getByRole('button', { name: 'Close Settings', exact: true }).click()
    await expect(f.page.getByRole('textbox', { name: 'Message composer', exact: true })).toHaveText('Synthetic annotation draft')
    expect(sdk.session.getActiveToolNames().sort()).toEqual(['annotate_electron', 'electron_ui'])
    expect(sdk.errors).toEqual([])
    await f.page.screenshot({ path: path.join(output, 'visible-app-after-detach.png') })
    await fs.writeFile(path.join(output, 'visible-real-pi-proof.json'), JSON.stringify({ sourceSession: sdk.session.sessionId,
      provider: 'cnc-offline', remoteProviderUsed: false, ownerPersonallyObserved: false,
      sourceAnnotationMessages: users.length, sourceTotalUserMessages: sdk.session.messages.filter(message => message.role === 'user').length,
      sourceToolResults: sdk.session.messages.filter(message => message.role === 'toolResult').length,
      sourceImages: 1, noneNativeCaptures: afterNone - beforeNone,
      providerCalls: sdk.observation.calls, transcript, cropFile, windowVisibility: await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.isVisible())) }, null, 2), { mode: 0o600 })
  } finally {
    await sdk?.shutdown()
    await f.application.evaluate(() => (globalThis as unknown as { __CNC_VISIBLE_CAPTURE__: { restore(): void } }).__CNC_VISIBLE_CAPTURE__.restore())
    if (previous === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previous
  }
})

test('ordinary production output and launch contain no development entry or listener', async () => {
  const files: string[] = []
  async function walk(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(file)
      else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) files.push(file)
    }
  }
  await walk(path.join(repository, 'out'))
  expect(files.length).toBeGreaterThan(0)
  const forbidden = ['cnc:development-ui', 'DEV_UI_REGISTRATION', '__CNC_DEV_UI__', '__CNC_DEV_UI_PAGE__', 'scripts/electron-development-ui']
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8')
    for (const marker of forbidden) expect(content, `${path.relative(repository, file)} contains ${marker}`).not.toContain(marker)
  }
  const f = await launch(path.join(repository, 'out/main/index.js'))
  expect(await discoverDevelopmentTargets({ directory: f.registry })).toEqual([])
  expect(await f.application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScriptInIsolatedWorld(1004,
    [{ code: 'typeof window.__CNC_DEV_UI__' }]))).toBe('undefined')
  expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

test('packaged host setup refuses before any registration or preload hook', async () => {
  await expect(installDevelopmentUi({ app: { isPackaged: true } })).rejects.toThrow('DEV_UI_DEVELOPMENT_ONLY')
})


test('one real offline Pi session reconnects after normal Electron app exit and delivers a new note', async () => {
  test.setTimeout(120_000)
  const first = await launch(path.join(output, 'main/index.js'))
  const previous = process.env.TMPDIR
  let sdk: Awaited<ReturnType<typeof createOfflineAnnotationSession>> | undefined
  let timer: NodeJS.Timeout | undefined
  try {
    process.env.TMPDIR = path.dirname(first.registry)
    sdk = await createOfflineAnnotationSession(first.root)
    const session = sdk.session.sessionManager.getSessionId()
    await sdk.session.prompt('/annotate-electron connect')
    await expect(first.page.locator('#pi-panel')).toBeVisible()
    expect(sdk.notices).toEqual([{ type: 'info', message: 'Development window connected. The annotation picker is active. UI tools remain bound to this window.' }])
    const owned = launches.find(item => item.application === first.application)!
    await first.application.evaluate(({ BrowserWindow }) => { setImmediate(() => BrowserWindow.getAllWindows()[0]!.close()) })
    const terminal = await Promise.race([owned.terminal, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Owned app exit did not complete')), 12_000)
    })])
    clearTimeout(timer); timer = undefined
    expect(terminal).toEqual({ code: 0, signal: null })
    expect(sdk.observation.calls).toBe(0)
    expect(sdk.annotationMessages()).toEqual([])

    const second = await launch(path.join(output, 'main/index.js'))
    process.env.TMPDIR = path.dirname(second.registry)
    const composer = second.page.getByRole('textbox', { name: 'Message composer', exact: true })
    await composer.fill('Owned reopened app draft')
    await expect(second.page.locator('#pi-panel')).toHaveCount(0)
    await sdk.session.prompt('/annotate-electron connect')
    expect(sdk.session.sessionManager.getSessionId()).toBe(session)
    expect(sdk.notices).toEqual([
      { type: 'info', message: 'Development window connected. The annotation picker is active. UI tools remain bound to this window.' },
      { type: 'info', message: 'Development window connected. The annotation picker is active. UI tools remain bound to this window.' },
    ])
    await expect(second.page.locator('#pi-panel')).toBeVisible()
    await second.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await second.page.locator('.pi-note-textarea').fill('Owned reopened app note')
    sdk.queueText('Owned reopened app note received. No source changes.')
    await second.page.locator('#pi-submit').click()
    await expect.poll(() => sdk!.observation.calls).toBe(1)
    await expect.poll(() => sdk!.session.isStreaming).toBe(false)
    expect(sdk.annotationMessages()).toHaveLength(1)
    expect(JSON.stringify(sdk.annotationMessages()[0])).toContain('Owned reopened app note')
    await sdk.session.prompt('/annotate-electron disconnect')
    await expect(second.page.locator('#pi-panel')).toHaveCount(0)
    await expect(composer).toHaveText('Owned reopened app draft')
    expect(await second.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false)
    expect(sdk.errors).toEqual([])
    await fs.writeFile(path.join(output, 'native-pi-app-reopen.json'), JSON.stringify({ firstExit: terminal,
      samePiSession: true, connections: 2, notes: 1, draft: 'Owned reopened app draft', visible: false }), { mode: 0o600 })
  } finally {
    if (timer) clearTimeout(timer)
    if (sdk) await sdk.shutdown()
    if (previous === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previous
  }
})
