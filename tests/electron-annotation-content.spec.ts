import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { observeTestChild } from './fixtures/owned-test-child'

for (const variant of ['preexisting', 'omitted', 'ordinary-preexisting', 'ordinary-selection', 'ordinary-submit']) {
const omittedRegions = variant === 'omitted'
const ordinaryStage = variant.startsWith('ordinary-') ? variant.slice('ordinary-'.length) : null
test(ordinaryStage ? `ordinary-control media refuses at ${ordinaryStage}` : omittedRegions ? 'R3 omitted-region paint refuses before activation, selection, and capture' : 'R3 preexisting unknown content refuses before screenshots, files, or delivery', async () => {
  test.skip(process.platform !== 'darwin', 'Hidden synthetic macOS check only.')
  test.setTimeout(70_000)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cnc-codex-desktop-')))
  const home = join(root, 'home'), profile = join(root, 'profile'), temporary = join(root, 'tmp')
  for (const p of [home, profile, temporary, join(root, 'captures'), join(home, '.pi/agent')]) await mkdir(p, { recursive: true, mode: 0o700 })
  await writeFile(join(profile, 'conversation-fixture.json'), JSON.stringify({ version: 1, suite: 'synthetic-codex-v1', home, profile }), { mode: 0o600 })
  await writeFile(join(home, 'Synthetic.mpr'), 'SYNTHETIC_PROJECT_UNCHANGED', { mode: 0o600 })
  await writeFile(join(home, '.pi/agent/auth.json'), 'SYNTHETIC_ORDINARY_PI_UNCHANGED', { mode: 0o600 })
  const log = await open(join(root, 'privacy.log'), 'wx', 0o600)
  const child = spawn(resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    [resolve('tests/fixtures/electron-annotation-flow.cjs'), `--user-data-dir=${profile}`, '--e2e-hidden', '--e2e-conversation-fixture', ordinaryStage ? `--annotation-ordinary-paint=${ordinaryStage}` : omittedRegions ? '--annotation-omitted-regions' : '--annotation-privacy-refusals'],
    { cwd: resolve('.'), env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: profile,
      APPDATA: profile, LOCALAPPDATA: profile, TMPDIR: temporary, CNC_MENDIX_E2E_HOME: home, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' },
      stdio: ['ignore', log.fd, log.fd] })
  const terminal = observeTestChild(child, 50_000)
  await log.close()
  const exit = await terminal
  await writeFile(join(root, 'parent-exit.json'), JSON.stringify(exit), { mode: 0o600 })
  expect(exit, `Evidence: ${root}`).toEqual({ code: 0, signal: null, timedOut: false, closeObserved: true, terminationRequested: false, spawnFailed: false })
  const report = JSON.parse(await readFile(join(root, 'flow-report.json'), 'utf8'))
  console.info(`Synthetic content evidence: ${root}`)
  expect(report.error, `Evidence: ${root}`).toBe(null)
  expect(report.operations, `Evidence: ${root}`).toEqual(omittedRegions || ordinaryStage ? [] : ['conversation:new-session', 'conversation:send-input'])
  if (ordinaryStage) {
    expect(report.ordinaryRefusals, `Evidence: ${root}`).toEqual(
      ['ordinary-border', 'ordinary-mask', 'ordinary-list', 'pseudo-border', 'pseudo-mask', 'marker-content', 'scrollbar-image', 'root-background', 'svg-fill', 'svg-stroke', 'filter-url'].filter(name => ordinaryStage !== 'submit' || name !== 'scrollbar-image').map(name => ({
        stage: ordinaryStage, name, error: ordinaryStage === 'preexisting' ? 'ANNOTATION_ACTIVATION_REFUSED' : 'ANNOTATION_CANCELLED', delivered: false, frames: 0, files: 0, idle: true, overlay: false,
      })))
  } else if (omittedRegions) {
    expect(report.omittedRefusals, `Evidence: ${root}`).toEqual(['preexisting', 'selection', 'submit'].flatMap(stage =>
      ['badge-before-image', 'badge-after-image', 'cursor-desc-image', 'cursor-desc-generated', 'cursor-desc-pseudo-image', 'selection-desc-image', 'selection-desc-generated', 'selection-desc-pseudo-image'].map(name => ({
        stage, name, error: stage === 'preexisting' ? 'ANNOTATION_ACTIVATION_REFUSED' : 'ANNOTATION_CANCELLED', delivered: false, frames: 0, files: 0, idle: true, overlay: false,
      }))))
    expect(report.plainLayerFlows, `Evidence: ${root}`).toEqual([
      { mode: 'none', keyboard: false, frames: 0, images: 0, markers: 2, settings: true, draft: 'Synthetic annotation draft', selection: 'Connect', overlay: false },
      { mode: 'crop', keyboard: false, frames: 1, images: 1, markers: 2, settings: true, draft: 'Synthetic annotation draft', selection: 'Connect', overlay: false },
      { mode: 'none', keyboard: true, frames: 0, images: 0, markers: 2, settings: true, draft: 'Synthetic annotation draft', selection: 'Connect', overlay: false },
    ])
  } else expect(report.privacyRefusals, `Evidence: ${root}`).toEqual(['static', 'button', 'gradient', 'image', 'compound', 'pseudo', 'generated-text', 'known-paint-rest', 'wrong-state', 'wrong-theme', 'transcript'].map(name => ({
    name, error: 'ANNOTATION_ACTIVATION_REFUSED', delivered: false, frames: 0, files: 0,
  })))
})
}
