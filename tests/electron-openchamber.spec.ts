import { test, expect, _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { writeOpenChamberFixture } from './fixtures/openchamber-app'

const require = createRequire(import.meta.url)
const { readLaunchConfig } = require('../scripts/electron-development-ui/launch-config.cjs')
const { discoverDevelopmentTargets, connectDevelopmentTarget } = require('../scripts/electron-development-ui/connection.cjs')
const { readVerifiedImage } = require('../scripts/electron-development-ui/images.cjs')

test.skip(process.platform !== 'darwin', 'OpenChamber adapter currently covers macOS development apps only.')
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp('/tmp/aeoc-'))
  await fs.chmod(root, 0o700)
  for (const dir of ['home', 'profile', 'tmp']) await fs.mkdir(path.join(root, dir), { mode: 0o700 })
  const app = await writeOpenChamberFixture(root)
  return { root, app, profile: path.join(root, 'profile'), registry: path.join(root, 'tmp', `cui-${process.getuid!()}`) }
}
async function launch() {
  const f = await fixture()
  const config = readLaunchConfig({ appRoot: f.app, adapter: 'openchamber', profile: f.profile })
  const application = await electron.launch({ args: [path.resolve('scripts/electron-development-ui/openchamber-main.mjs')],
    env: { PATH: process.env.PATH ?? '', HOME: path.join(f.root, 'home'), TMPDIR: path.join(f.root, 'tmp'),
      PI_ANNOTATE_APP_ROOT: f.app, PI_ANNOTATE_PROFILE: f.profile, PI_ANNOTATE_ADAPTER: 'openchamber',
      PI_ANNOTATE_RENDERER_FILE: config.renderer, PI_ANNOTATE_TEST_PACKAGE: path.resolve('package.json') } })
  const page = await application.firstWindow()
  await page.getByRole('button', { name: 'Sample action', exact: true }).waitFor()
  return { ...f, application, page }
}

test('OpenChamber launch config pins built files, adapter and explicit profile', async () => {
  const f = await fixture()
  const valid = { appRoot: f.app, adapter: 'openchamber', profile: f.profile }
  expect(readLaunchConfig(valid)).toMatchObject({ adapter: 'openchamber', name: 'OpenChamber development',
    entry: path.join(f.app, 'packages/electron/entry.mjs'), renderer: path.join(f.app, 'packages/electron/resources/web-dist/index.html') })
  for (const value of [{ ...valid, adapter: 'unknown' }, { ...valid, profile: undefined }, { ...valid, renderer: 'https://example.invalid' },
    { ...valid, entry: 'other.mjs' }, { ...valid, extra: true }]) expect(() => readLaunchConfig(value)).toThrow('ANNOTATE_ELECTRON_LAUNCH_REFUSED')
  await fs.writeFile(path.join(f.app, 'packages/electron/package.json'), '{invalid', { mode: 0o600 })
  expect(() => readLaunchConfig(valid)).toThrow('ANNOTATE_ELECTRON_LAUNCH_REFUSED')
})

test('pre-ready custom UI supports guarded None, crop, stale references and non-destructive detach', async () => {
  test.setTimeout(45_000)
  const f = await launch()
  let ui: any
  try {
    expect(await f.application.evaluate(({ app, BrowserWindow }) => ({ home: app.getPath('home'), profile: app.getPath('userData'),
      windows: BrowserWindow.getAllWindows().map(window => ({ visible: window.isVisible(), sandbox: (window.webContents as unknown as { getLastWebPreferences(): { sandbox: boolean } }).getLastWebPreferences().sandbox })) })))
      .toEqual({ home: path.join(f.root, 'home'), profile: f.profile, windows: [{ visible: false, sandbox: false }] })
    const targets = await discoverDevelopmentTargets({ directory: f.registry })
    expect(targets).toHaveLength(1)
    expect(targets[0].label).toBe('OpenChamber development')
    const events: any[] = []
    ui = await connectDevelopmentTarget(targets[0], { directory: f.registry, session: 'openchamber-fixture', onEvent: (event: unknown) => events.push(event) })
    const snapshot = (await ui.request('snapshot')).value
    const target = snapshot.nodes.find((node: { name: string }) => node.name === 'Sample action')
    expect(target).toBeTruthy()
    await ui.request('click', { ref: target.ref, revision: snapshot.revision })
    await expect(f.page.locator('#target')).toHaveAttribute('data-activations', '1')
    await f.page.locator('#draft').focus()
    await ui.request('annotate', { mode: 'none' })
    await f.page.locator('#target').click()
    await f.page.getByRole('textbox', { name: 'Feedback', exact: true }).fill('Literal {feedback} from custom UI.')
    await f.page.getByRole('button', { name: 'Send annotations', exact: true }).click()
    await expect.poll(() => events.filter(value => value.kind === 'annotation').length).toBe(1)
    expect(events[0]).toMatchObject({ outcome: 'submitted', mode: 'none', notes: [{ comment: 'Literal {feedback} from custom UI.' }] })
    expect(events[0].notes[0]).not.toHaveProperty('image')
    expect(await f.application.evaluate(() => (globalThis as any).fixtureCaptures())).toBe(0)
    await expect(f.page.locator('#target')).toHaveAttribute('data-activations', '1')
    await expect(f.page.locator('#draft')).toHaveValue('Keep this draft')
    await ui.request('annotate', { mode: 'crop' })
    await f.page.locator('#target').click()
    await f.page.getByRole('textbox', { name: 'Feedback', exact: true }).fill('Verified custom UI crop.')
    await f.page.getByRole('button', { name: 'Send annotations', exact: true }).click()
    await expect.poll(() => events.filter(value => value.kind === 'annotation').length).toBe(2)
    const image = events[1].notes[0].image
    expect(image.mime).toBe('image/png')
    expect((await readVerifiedImage(image, ui.binding.connection)).length).toBeGreaterThan(0)
    expect(await f.application.evaluate(() => (globalThis as any).fixtureCaptures())).toBe(1)
    await f.page.reload()
    await expect.poll(() => ui.active).toBe(false)
    await expect.poll(() => ui.cleanupConfirmed).toBe(true)
    await ui.close()
    const fresh = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
    ui = await connectDevelopmentTarget(fresh, { directory: f.registry, session: 'openchamber-fixture' })
    await expect(ui.request('click', { ref: target.ref, revision: snapshot.revision })).rejects.toMatchObject({ code: 'STALE_REFERENCE' })
    await ui.close()
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.isDestroyed()))).toEqual([false])
    expect(await f.page.locator('#pi-panel').count()).toBe(0)
  } finally { if (ui?.active) await ui.close(); await f.application.close() }
})

for (const connected of [false, true]) test(`retained hidden main window supports reactivation and explicit reconnect after ${connected ? 'connected' : 'disconnected'} close`, async () => {
  const f = await launch()
  let ui: any
  try {
    const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
    await f.page.locator('#draft').fill('Draft survives retained close.')
    let oldSnapshot: any, oldRef: string | undefined
    if (connected) {
      ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'retained-main' })
      oldSnapshot = (await ui.request('snapshot')).value
      oldRef = oldSnapshot.nodes.find((node: { name: string }) => node.name === 'Sample action').ref
      await ui.request('annotate', { mode: 'none' })
    }
    await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close())
    if (ui) {
      await expect.poll(() => ui.active).toBe(false)
      await expect.poll(() => ui.cleanupConfirmed).toBe(true)
      await ui.close()
    }
    await f.application.evaluate(({ app }) => { app.emit('activate') })
    await expect.poll(() => discoverDevelopmentTargets({ directory: f.registry })).toEqual([target])
    expect(await f.application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ destroyed: window.isDestroyed(), visible: window.isVisible() }))))
      .toEqual([{ destroyed: false, visible: false }])
    ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'retained-main' })
    await ui.request('snapshot')
    if (oldRef) await expect(ui.request('click', { ref: oldRef, revision: oldSnapshot.revision })).rejects.toMatchObject({ code: 'STALE_REFERENCE' })
    await expect(f.page.locator('#draft')).toHaveValue('Draft survives retained close.')
    expect(await f.application.evaluate(() => (globalThis as any).fixtureCaptures())).toBe(0)
  } finally { if (ui?.active) await ui.close(); await f.application.close() }
})

test('OpenChamber can cancel its quit confirmation without bridge-forced retry or detach', async () => {
  const f = await launch()
  let ui: any
  try {
    const target = (await discoverDevelopmentTargets({ directory: f.registry }))[0]
    ui = await connectDevelopmentTarget(target, { directory: f.registry, session: 'openchamber-cancel-quit' })
    await f.application.evaluate(({ app }) => { (globalThis as any).fixtureCancelQuit = true; app.quit() })
    expect((await ui.request('status')).value).toEqual({ state: 'connected-idle' })
    expect(ui.active).toBe(true)
    expect(await discoverDevelopmentTargets({ directory: f.registry })).toEqual([target])
    await expect(f.page.locator('#draft')).toHaveValue('Keep this draft')
  } finally {
    await f.application.evaluate(() => { (globalThis as any).fixtureCancelQuit = false })
    if (ui?.active) await ui.close()
    await f.application.close()
  }
})

test('only exact local main documents are discoverable; children, alternate pages and remote origins are refused', async () => {
  const f = await launch()
  try {
    await f.application.evaluate(async ({ BrowserWindow }) => {
      const parent = BrowserWindow.getAllWindows().find(window => !window.getParentWindow())!
      const child = new BrowserWindow({ parent, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } })
      await child.loadURL('openchamber-ui://app/index.html')
    })
    expect(await discoverDevelopmentTargets({ directory: f.registry })).toHaveLength(1)
    for (const url of ['openchamber-ui://app/__splash', 'openchamber-ui://app/mini-chat.html', 'openchamber-ui://other/index.html',
      'openchamber-ui://app/index.html?other=true', 'data:text/html,<title>Unrelated document</title>']) {
      await f.application.evaluate(async ({ BrowserWindow }, url) => { await BrowserWindow.getAllWindows().find(window => !window.getParentWindow())!.loadURL(url) }, url)
      expect(await discoverDevelopmentTargets({ directory: f.registry })).toEqual([])
    }
  } finally { await f.application.close() }
})
