import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { observeTestChild } from './fixtures/owned-test-child'

test('portless hidden Electron proves isolated picker note input and Settings compatibility', async () => {
  test.skip(process.platform !== 'darwin', 'This is a hidden macOS proof, not Windows or native foreground acceptance.')
  test.setTimeout(70_000)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cnc-codex-desktop-')))
  const home = join(root, 'home'), profile = join(root, 'profile'), temporary = join(root, 'tmp')
  await Promise.all([home, profile, temporary, join(home, '.pi/agent')].map(path => mkdir(path, { recursive: true, mode: 0o700 })))
  await writeFile(join(home, 'Synthetic.mpr'), 'SYNTHETIC_PROJECT_UNCHANGED', { mode: 0o600 })
  await writeFile(join(home, '.pi/agent/auth.json'), 'SYNTHETIC_ORDINARY_PI_UNCHANGED', { mode: 0o600 })
  await writeFile(join(profile, 'conversation-fixture.json'), JSON.stringify({ version: 1, suite: 'synthetic-codex-v1', home, profile }), { mode: 0o600 })
  const output = await open(join(root, 'annotation-proof.log'), 'wx', 0o600)
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: profile,
    APPDATA: profile, LOCALAPPDATA: profile, TMPDIR: temporary, CNC_MENDIX_E2E_HOME: home,
    PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' }
  const child = spawn(resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    [resolve('tests/fixtures/electron-annotation-proof.cjs'), `--user-data-dir=${profile}`, '--e2e-hidden', '--e2e-conversation-fixture'],
    { cwd: resolve('.'), env, stdio: ['ignore', output.fd, output.fd] })
  const terminal = observeTestChild(child, 50_000)
  await output.close()
  const exit = await terminal
  await writeFile(join(root, 'parent-exit.json'), JSON.stringify(exit), { mode: 0o600 })
  expect(exit, `Retained proof evidence: ${root}`).toEqual({ code: 0, signal: null, timedOut: false, closeObserved: true, terminationRequested: false, spawnFailed: false })
  const report = JSON.parse(await readFile(join(root, 'annotation-proof.json'), 'utf8'))
  expect(report, `Retained proof evidence: ${root}`).toMatchObject({
    success: true,
    steps: ['synthetic connection settings open'],
    permissions: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    hidden: true,
    paths: { home, profile },
    debug: { renderer: false, inspector: false },
    appWorld: { bridge: 'undefined', node: 'undefined', chromeId: null },
    restrictions: { full: true, debug: true, etch: true, none: true },
    input: { text: 'Reduce the Settings button padding', focused: true, selected: '1 selected' },
    submissions: [{ tag: 'button', comment: 'Reduce the Settings button padding' }],
    afterSubmit: { overlay: false, cursor: 'help', errors: [] },
    dialogAfterSubmit: true,
    afterEscape: { overlay: false, cursor: 'help' },
    dialogAfterEscape: true,
    appWorldAfter: { bridge: 'undefined', node: 'undefined', chromeId: null },
  })
  expect(report.submissions[0].selector).toContain('button')
  expect(await readFile(join(home, '.pi/agent/auth.json'), 'utf8')).toBe('SYNTHETIC_ORDINARY_PI_UNCHANGED')
  expect(await readFile(join(home, 'Synthetic.mpr'), 'utf8')).toBe('SYNTHETIC_PROJECT_UNCHANGED')
  let events = ''
  try { events = await readFile(join(profile, 'conversation-fixture-events.jsonl'), 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  expect(events).toBe('')
})
