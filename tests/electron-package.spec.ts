import { test, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, symlink, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
let installed: string

test.beforeAll(async () => {
  const root = await mkdtemp('/tmp/pi-annotate-package-')
  const { stdout } = await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root])
  installed = path.join(root, 'node_modules/pi-annotate-electron')
  await mkdir(installed, { recursive: true, mode: 0o700 })
  await run('tar', ['-xzf', path.join(root, JSON.parse(stdout)[0].filename), '--strip-components=1', '-C', installed])
  // Reproduce npm's hoisted dependency layout with the real pinned dependencies.
  // These links belong only to this private test installation, not package source.
  for (const name of ['electron', 'pi-annotate']) await symlink(path.dirname(require.resolve(name + '/package.json')), path.join(root, 'node_modules', name), 'dir')
})

test('package checks identify malformed JSON and retain the parse cause', async ({}, testInfo) => {
  const root = testInfo.outputPath('invalid-package')
  await mkdir(path.join(root, 'scripts'), { recursive: true, mode: 0o700 })
  await mkdir(path.join(root, 'design'), { mode: 0o700 })
  await writeFile(path.join(root, 'scripts/check-package.mjs'), await readFile('scripts/check-package.mjs'), { mode: 0o600 })
  await writeFile(path.join(root, 'design/integrity.json'), '{invalid', { mode: 0o600 })
  const result = await run(process.execPath, [path.join(root, 'scripts/check-package.mjs')]).then(
    () => ({ code: 0, stderr: '' }),
    (error: Error & { code?: number; stderr?: string }) => ({ code: error.code, stderr: error.stderr ?? '' }),
  )
  expect(result.code).toBe(1)
  expect(result.stderr).toContain('Invalid JSON in design/integrity.json')
  expect(result.stderr).toContain('SyntaxError')
})

test('published package exposes a runnable launcher command', async () => {
  const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'))
  expect(manifest.bin?.['pi-annotate-electron']).toBe('bin/launch.mjs')
  const { stdout } = await run(path.join(installed, 'bin/launch.mjs'), ['--help'])
  expect(stdout).toContain('--app')
  expect(stdout).toContain('--renderer')
})

test('published package includes the built synthetic workspace', async () => {
  for (const file of ['out/main/index.js', 'out/preload/index.cjs', 'out/renderer/index.html', 'out/renderer/app.js', 'out/renderer/tokens.css']) await access(path.join(installed, file))
})

test('packed picker delivers a None note with hoisted dependencies', async ({ page }) => {
  await page.setContent('<button id="target">Synthetic package control</button>')
  await page.evaluate(() => {
    let select: (point: { x: number; y: number }) => void
    const route = (event: MouseEvent) => {
      if ((event.target as Element).closest('#pi-panel,.pi-note-card,#pi-markers')) return
      event.preventDefault(); event.stopImmediatePropagation(); select({ x: event.clientX, y: event.clientY })
    }
    ;(window as any).__CNC_DEV_UI__ = { guard(active: boolean) { if (active) document.addEventListener('click', route, true); else document.removeEventListener('click', route, true) },
      onHover() {}, onWheel() {}, onSelect(callback: typeof select) { select = callback }, onEscape() {}, inputState() { return {} },
      post(_owner: string, value: unknown) { return (window as any).packagePost(value) } }
  })
  const { createPicker } = require(path.join(installed, 'scripts/electron-development-ui/picker.cjs'))
  const events: any[] = []
  const picker = createPicker({ contents: { isDestroyed: () => false, executeJavaScriptInIsolatedWorld: (_world: number, scripts: { code: string }[]) => page.evaluate(code => (0, eval)(code), scripts[0].code) },
    binding: { session: 'package-test', instance: 'fixture', window: 'main', connection: 'package-test', generation: 1 },
    emit: (event: unknown) => events.push(event), isCurrent: () => true, onRevoked: () => { throw new Error('Unexpected cleanup failure') }, repositoryRoot: installed, images: {} })
  await page.exposeFunction('packagePost', (value: unknown) => picker.receive(value))
  try {
    await picker.start('package-request', 'none')
    await page.locator('#target').click()
    await page.getByRole('textbox', { name: 'Feedback', exact: true }).fill('Packed installation feedback.')
    await page.getByRole('button', { name: 'Send annotations', exact: true }).click()
    await expect.poll(() => events.length).toBe(1)
    expect(events[0]).toMatchObject({ outcome: 'submitted', mode: 'none', notes: [{ name: 'Synthetic package control', comment: 'Packed installation feedback.' }] })
    expect(events[0].notes[0]).not.toHaveProperty('image')
  } finally { await picker.close() }
})

test('packed owned launcher starts and cancels its hidden picker with hoisted dependencies', async () => {
  test.skip(process.platform !== 'darwin', 'Hidden native package smoke currently covers macOS.')
  const { createOwnedAnnotationLaunch } = await import(pathToFileURL(path.join(installed, 'scripts/electron-annotations/launch.mjs')).href)
  const launch = await createOwnedAnnotationLaunch({ session: 'packed-launch-test' })
  try {
    expect(launch.ready).toMatchObject({ synthetic: true, hidden: true, permissions: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    const pending = launch.annotate({ mode: 'none', timeoutMs: 5000 }).catch((error: Error) => error.message)
    await expect.poll(async () => (await launch.status()).phase).toBe('active')
    await launch.cancel()
    expect(await pending).toBe('ANNOTATION_REQUEST_FAILED')
    expect((await launch.status()).phase).toBe('idle')
  } finally { expect(await launch.close()).toMatchObject({ code: 0, signal: null, closeObserved: true, terminationRequested: false }) }
})
