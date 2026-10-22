// Reproduce public media using only the hidden, offline synthetic app.
import { _electron as electron, chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url), run = promisify(execFile)
const { discoverDevelopmentTargets, connectDevelopmentTarget } = require('./electron-development-ui/connection.cjs')
const repository = path.resolve(import.meta.dirname, '..'), media = path.join(repository, 'docs/media')
if (process.platform !== 'darwin') throw new Error('DEMO_MACOS_ONLY')
await fs.mkdir(media, { recursive: true })
const root = await fs.realpath(await fs.mkdtemp('/tmp/pi-annotate-demo-'))
for (const name of ['home', 'profile', 'tmp', 'frames']) await fs.mkdir(path.join(root, name), { mode: 0o700 })
await fs.writeFile(path.join(root, '.owned-dev-ui-fixture'), 'public synthetic demo', { mode: 0o600 })
const application = await electron.launch({ args: [path.join(repository, 'tests/fixtures/electron-development-ui-boot.cjs'), path.join(repository, 'out/main/index.js'), '--external-bridge', `--user-data-dir=${root}/profile`],
  cwd: repository, env: { PATH: process.env.PATH, HOME: `${root}/home`, USERPROFILE: `${root}/home`, TMPDIR: `${root}/tmp`,
    XDG_CONFIG_HOME: `${root}/profile`, CNC_MENDIX_E2E_HOME: `${root}/home`, CNC_DEV_UI_FIXTURE_ROOT: root, PI_OFFLINE: '1' } })
let ui
const frames = []
try {
  const page = await application.firstWindow()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 860))
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
  if (await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())) throw new Error('DEMO_MUST_STAY_HIDDEN')
  const shot = async (duration = 1.5) => { const file = path.join(root, 'frames', `${frames.length}.png`); await page.screenshot({ path: file }); frames.push({ file, duration }) }
  await shot(1)
  const targets = await discoverDevelopmentTargets({ directory: path.join(root, 'tmp', `cui-${process.getuid()}`) })
  const events = []
  ui = await connectDevelopmentTarget(targets[0], { directory: path.join(root, 'tmp', `cui-${process.getuid()}`), session: 'public-demo', onEvent: event => events.push(event) })
  await ui.request('annotate', { mode: 'none' }); await shot(1)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const move = async (index, x, y) => {
    const header = page.locator('.pi-note-card').nth(index).locator('.pi-note-header'), box = await header.boundingBox()
    await page.mouse.move(box.x + 3, box.y + 3); await page.mouse.down(); await page.mouse.move(x + 3, y + 3, { steps: 6 }); await page.mouse.up()
  }
  await move(0, 250, 130)
  await page.getByRole('textbox', { name: 'Feedback', exact: true }).fill('Give the settings entry a clearer label.')
  await shot(2)
  await page.getByRole('button', { name: 'Show element details', exact: true }).click(); await shot(2)
  await page.getByRole('button', { name: 'Hide element details', exact: true }).click()
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await move(1, 760, 130)
  await page.locator('.pi-note-textarea').nth(1).fill('Use a consistent icon size here.')
  await shot(2)
  await page.screenshot({ path: path.join(media, 'preview.png') })
  await page.getByRole('button', { name: 'Hide annotations', exact: true }).click(); await shot(1)
  await page.getByRole('button', { name: 'Show annotations', exact: true }).click()
  await page.locator('.pi-note-card').nth(1).getByRole('button', { name: 'Minimize annotation', exact: true }).click(); await shot(1)
  await page.locator('.pi-note-card').nth(1).getByRole('button', { name: 'Expand annotation', exact: true }).click()
  await page.getByRole('button', { name: 'Send annotations', exact: true }).click()
  await page.locator('#pi-panel').waitFor({ state: 'detached' })
  const result = events.find(event => event.kind === 'annotation')
  if (result?.outcome !== 'submitted' || result.notes.length !== 2 || result.notes.some(note => note.image)) throw new Error('DEMO_DELIVERY_UNCONFIRMED')
  await shot(1.5)
  await fs.writeFile(path.join(root, 'delivery.json'), JSON.stringify(result, null, 2), { mode: 0o600 })
  await ui.request('annotate', { mode: 'none' })
  await page.evaluate(() => document.documentElement.dataset.theme = 'light')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await move(0, 500, 130)
  await page.locator('.pi-note-textarea').fill('The same tools, in light mode.')
  await page.screenshot({ path: path.join(media, 'light.png') })
} finally {
  await ui?.close()
  await application.close()
}
const list = path.join(root, 'frames.txt')
await fs.writeFile(list, frames.map(frame => `file '${frame.file}'\nduration ${frame.duration}\n`).join('') + `file '${frames.at(-1).file}'\n`, { mode: 0o600 })
await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=12,scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(media, 'demo.mp4')])
await run('ffmpeg', ['-y', '-i', path.join(media, 'demo.mp4'), '-filter_complex', '[0:v]fps=8,scale=960:-1,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer', '-loop', '0', path.join(media, 'demo.gif')])
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 350 } })
  const logos = await Promise.all(['logo-focus', 'logo-pointer', 'logo-orbit'].map(name => fs.readFile(path.join(media, name + '.svg'), 'utf8')))
  await page.setContent(`<style>body{margin:0;background:#151413;color:#dbd7cc;font:16px system-ui;display:flex;justify-content:space-evenly;align-items:center;min-height:350px}figure{margin:0;text-align:center}svg{width:128px;height:128px}figcaption{margin-top:22px}</style>${logos.map((logo, index) => `<figure>${logo}<figcaption>${['Focus Note', 'Pointer Note', 'Orbit Mark'][index]}</figcaption></figure>`).join('')}`)
  await page.screenshot({ path: path.join(media, 'logo-options.png') })
  const primaryLogo = await fs.readFile(path.join(media, 'logo.svg'), 'utf8')
  await page.setViewportSize({ width: 512, height: 512 })
  await page.setContent(`<style>body{margin:0;background:transparent}svg{display:block;width:512px;height:512px}</style>${primaryLogo}`)
  await page.screenshot({ path: path.join(media, 'logo.png'), omitBackground: true })
} finally { await browser.close() }
console.log(`Captured synthetic media. Private verification evidence retained at ${root}`)
