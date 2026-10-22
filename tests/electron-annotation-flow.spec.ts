import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, open, readFile, realpath, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { observeTestChild } from './fixtures/owned-test-child'

const scenarios = [
  ...[980, 1280, 1440].flatMap(width => [1, 2].map(scale => ({ width, scale, sidebarSettings: false, light: false }))),
  { width: 1280, scale: 1, sidebarSettings: true, light: false },
  { width: 1280, scale: 1, sidebarSettings: true, light: true },
]
for (const { width, scale, sidebarSettings, light } of scenarios) test(`actual controller at ${width}px and scale ${scale} delivers None and a verified crop${sidebarSettings ? ' via the Settings button' : ''}${light ? ' in light theme' : ''}`,  async () => {
  test.skip(process.platform !== 'darwin', 'Hidden macOS integration only.')
  test.setTimeout(80_000)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cnc-codex-desktop-')))
  const home = join(root, 'home'), profile = join(root, 'profile'), temporary = join(root, 'tmp')
  for (const directory of [home, profile, temporary, join(root, 'captures'), join(home, '.pi/agent')]) await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(profile, 'conversation-fixture.json'), JSON.stringify({ version: 1, suite: 'synthetic-codex-v1', home, profile }), { mode: 0o600 })
  await writeFile(join(home, 'Synthetic.mpr'), 'SYNTHETIC_PROJECT_UNCHANGED', { mode: 0o600 })
  await writeFile(join(home, '.pi/agent/auth.json'), 'SYNTHETIC_ORDINARY_PI_UNCHANGED', { mode: 0o600 })
  console.log(`Synthetic flow evidence: ${root}`)
  const log = await open(join(root, 'flow.log'), 'wx', 0o600)
  const child = spawn(resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    [resolve('tests/fixtures/electron-annotation-flow.cjs'), `--user-data-dir=${profile}`, '--e2e-hidden', '--e2e-conversation-fixture', `--force-device-scale-factor=${scale}`, `--annotation-proof-width=${width}`, '--annotation-native-pointer',
      ...(sidebarSettings ? ['--annotation-sidebar-settings'] : []), ...(light ? ['--annotation-light'] : [])],
    { cwd: resolve('.'), env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: profile,
      APPDATA: profile, LOCALAPPDATA: profile, TMPDIR: temporary, CNC_MENDIX_E2E_HOME: home, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' },
      stdio: ['ignore', log.fd, log.fd] })
  const terminal = observeTestChild(child, 60_000)
  await log.close()
  const exit = await terminal
  await writeFile(join(root, 'parent-exit.json'), JSON.stringify(exit), { mode: 0o600 })
  expect(exit, `Evidence: ${root}`).toEqual({ code: 0, signal: null, timedOut: false, closeObserved: true, terminationRequested: false, spawnFailed: false })
  const report = JSON.parse(await readFile(join(root, 'flow-report.json'), 'utf8'))
  expect(report.error, `Evidence: ${root}`).toBe(null)
  if (sidebarSettings) {
    expect(report.settingsInitiallyClosed).toBe(true)
    expect(report.settingsEntryDialog).toBe('Settings')
  }
  const color = light ? ['rgba(0, 0, 0, 0.04)', 'rgba(0, 0, 0, 0.08)'] : ['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.1)']
  expect(report.pointerPaints[0]).toEqual({ hover: `linear-gradient(${color[0]}, ${color[0]})`, pressed: `linear-gradient(${color[1]}, ${color[1]})` })
  expect(report.refusals).toEqual(['secret', 'editable', 'plaintext', 'collision'].map(name => ({name, result:'ANNOTATION_ACTIVATION_REFUSED'})))
  expect(report.flows.map((flow: { mode: string }) => flow.mode)).toEqual(['none', 'crop', 'crop', 'crop', 'none', 'crop'])
  for (const flow of report.flows.slice(0, 2)) {
    expect(flow.result).toMatchObject({ version: 1, target: 'flow-target', session: 'synthetic-flow-session', generation: 1,
      selections: [{ tag: 'button', role: 'button', name: 'Connect Codex', comment: 'Reduce the Settings button padding' }] })
    expect(flow.restored).toEqual({ overlay: false, settings: true, bridge: 'undefined', cursor: 'help', draft: 'Synthetic annotation draft', focus: 'Connect Codex', selection: 'Connect', scroll: 120 })
    expect(flow.lane).toEqual({ phase: 'idle', request: null, generation: 1, pending: 0 })
  }
  expect(report.flows[0].result.images).toEqual([])
  expect(report.flows[0].result.captureCount).toBe(0)
  expect(report.flows[1].result.captureCount).toBe(1)
  expect(report.flows[1].result.images).toHaveLength(1)
  expect(report.failures.map(({restored: _restored, ...facts}: any) => facts)).toEqual([
    { failure: 'canvas', refused: true, captures: 1, hidden: true, phase: 'idle', frames: 1 },
    { failure: 'capture', refused: true, captures: 1, hidden: true, phase: 'idle', frames: 0 },
    { failure: 'challenge', refused: true, captures: 1, hidden: true, phase: 'idle', frames: 0 },
    { failure: 'stale', refused: true, captures: 1, hidden: true, phase: 'idle', frames: 1 },
    { failure: 'unknown', refused: true, captures: 3, hidden: true, phase: 'idle', frames: 0 },
  ])
  for (const item of [...report.flows, ...report.failures]) expect(item.restored).toEqual({ overlay:false,settings:true,bridge:'undefined',cursor:'help',draft:'Synthetic annotation draft',focus:'Connect Codex',selection:'Connect',scroll:120 })
  expect(report.flows[2].result.viewport).toMatchObject({ width, dpr: scale })
  expect(report.flows[2].result.selections[0]).toMatchObject({ name: 'Geometry fixture', bounds: { width: 100, height: 40 } })
  expect(report.flows[2].result.images[0]).toMatchObject({ width: 140 * scale, height: 80 * scale })
  expect(report.flows[3].result.images).toEqual([])
  expect(report.flows[3].result.captureCount).toBe(0)
  expect(report.flows.map((flow: any) => flow.frames)).toEqual([0, 1, 1, 0, 0, 1])
  expect(report.flows[5].result.selections.map((item: any) => item.image)).toEqual([false,true])
  expect(report.flows[5].result.images).toHaveLength(1)
  expect(report.flows[5].result.images[0]).toMatchObject({index:2,width:140*scale,height:80*scale})
  expect(report.malformed).toEqual([true,true,true])
  expect(report.flows[4].result.selections[0].name).toBe('Connect Codex')
  expect(report.operations).toEqual([])
  expect(report.exits).toEqual(['escape', 'cancel'].map(exit => ({exit, outcome: 'ANNOTATION_CANCELLED', state: {overlay:false,settings:true,bridge:'undefined',cursor:'help',draft:'Synthetic annotation draft',focus:'Connect Codex',selection:'Connect',scroll:120}})))
  expect(report.reload).toEqual({outcome:'ANNOTATION_STALE_GENERATION', generation:2, overlay:false, phase:'idle'})
  expect(report.crossDocumentExecutions).toBe(0)
  const image = report.flows[1].result.images[0]
  expect(dirname(image.path)).toBe(join(root, 'captures'))
  const bytes = await readFile(image.path)
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256)
  expect((await stat(image.path)).mode & 0o777).toBe(0o600)
})
