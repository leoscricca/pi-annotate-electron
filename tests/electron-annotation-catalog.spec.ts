import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { observeTestChild } from './fixtures/owned-test-child'

for (const route of ['model-menu', 'sidebar'] as const) test(`the frozen synthetic-state catalog covers the controlled workspace and Settings states via ${route}`, async () => {
  test.skip(process.platform !== 'darwin', 'Hidden synthetic macOS catalog check only.')
  test.setTimeout(70_000)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cnc-codex-desktop-')))
  const home = join(root, 'home'), profile = join(root, 'profile'), temporary = join(root, 'tmp')
  for (const p of [home, profile, temporary, join(root, 'captures'), join(home, '.pi/agent')]) await mkdir(p, { recursive: true, mode: 0o700 })
  await writeFile(join(profile, 'conversation-fixture.json'), JSON.stringify({ version: 1, suite: 'synthetic-codex-v1', home, profile }), { mode: 0o600 })
  await writeFile(join(home, 'Synthetic.mpr'), 'SYNTHETIC_PROJECT_UNCHANGED', { mode: 0o600 })
  await writeFile(join(home, '.pi/agent/auth.json'), 'SYNTHETIC_ORDINARY_PI_UNCHANGED', { mode: 0o600 })
  const log = await open(join(root, 'catalog.log'), 'wx', 0o600)
  const child = spawn(resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    [resolve('tests/fixtures/electron-annotation-catalog.cjs'), `--user-data-dir=${profile}`, '--e2e-hidden', '--e2e-conversation-fixture',
      ...(route === 'sidebar' ? ['--annotation-sidebar-settings'] : [])],
    { cwd: resolve('.'), env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: profile,
      APPDATA: profile, LOCALAPPDATA: profile, TMPDIR: temporary, CNC_MENDIX_E2E_HOME: home, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' },
      stdio: ['ignore', log.fd, log.fd] })
  const terminal = observeTestChild(child, 50_000)
  await log.close()
  const exit = await terminal
  await writeFile(join(root, 'parent-exit.json'), JSON.stringify(exit), { mode: 0o600 })
  console.log(`Controlled catalog evidence: ${root}`)
  expect(exit).toEqual({ code: 0, signal: null, timedOut: false, closeObserved: true, terminationRequested: false, spawnFailed: false })
  const report = JSON.parse(await readFile(join(root, 'catalog-candidate.json'), 'utf8'))
  expect(report.error, `Evidence: ${root}`).toBe(null)
  expect(report.cases).toHaveLength(route === 'sidebar' ? 48 : 64)
  expect(report.controls).toContain('Connect Codex')
  const catalog = JSON.parse(await readFile(resolve('scripts/electron-annotations/synthetic-states.json'), 'utf8'))
  expect(catalog.version).toBe(1)
  expect(report.states.every((hash: string) => catalog.states.includes(hash))).toBe(true)
  expect(report.controls.every((name: string) => catalog.controls.includes(name))).toBe(true)
})
