import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(process.env.PI_ANNOTATE_TEST_PACKAGE)
const { app, BrowserWindow, protocol, session } = require('electron')
const root = path.dirname(process.env.PI_ANNOTATE_APP_ROOT)
const mark = (kind, facts = {}) => fs.appendFileSync(path.join(root, 'trace.jsonl'), JSON.stringify({ kind, ...facts }) + '\n', { mode: 0o600 })
const gate = name => new Promise(resolve => {
  const file = path.join(root, name)
  if (fs.existsSync(file)) return resolve()
  fs.watchFile(file, { interval: 20 }, () => {
    if (!fs.existsSync(file)) return
    fs.unwatchFile(file)
    resolve()
  })
})
if (app.isReady()) throw new Error('FIXTURE_PRE_READY_SETUP_MISSED')
protocol.registerSchemesAsPrivileged([{ scheme: 'openchamber-ui', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.setPath('home', path.join(root, 'home'))
app.setPath('temp', path.join(root, 'tmp'))
app.setPath('userData', process.env.OPENCHAMBER_DESKTOP_USER_DATA_DIR)
app.setActivationPolicy('prohibited')
app.commandLine.appendSwitch('disable-gpu')
let exitPending = false
app.on('before-quit', () => mark('before-quit'))
const productQuit = event => {
  event.preventDefault()
  if (globalThis.fixtureCancelQuit) { mark('quit-cancelled'); return }
  if (exitPending) return
  exitPending = true
  queueMicrotask(() => { mark('app-exit-requested'); app.exit(0) })
}
app.on('will-quit', () => mark('will-quit'))
app.on('quit', (_event, code) => mark('quit', { code }))
app.on('window-all-closed', () => app.quit())
mark('entry', { pid: process.pid, ready: app.isReady() })
if (process.env.PI_ANNOTATE_TEST_STAGE === 'startup') {
  await gate('startup-release')
  mark('startup-settled')
}
app.whenReady().then(async () => {
  if (process.env.PI_ANNOTATE_TEST_STAGE === 'post-ready') {
    mark('post-ready-entered')
    await gate('product-init-release')
  }
  app.on('before-quit', productQuit)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  protocol.handle('openchamber-ui', request => {
    const url = new URL(request.url)
    return new Response(url.pathname === '/__splash' ? '<title>Owned splash</title>' : fs.readFileSync(process.env.PI_ANNOTATE_RENDERER_FILE),
      { headers: { 'content-type': 'text/html' } })
  })
  const window = new BrowserWindow({ width: 800, height: 650, show: false, focusable: false,
    webPreferences: { contextIsolation: true, sandbox: false, nodeIntegration: false } })
  window.on('close', event => {
    if (!exitPending) { event.preventDefault(); window.hide(); mark('window-retained') }
  })
  app.on('activate', () => { window.restore(); mark('retained-window-reactivated') })
  const capture = window.webContents.capturePage.bind(window.webContents)
  let captures = 0
  window.webContents.capturePage = async (...args) => {
    captures++
    mark('capture-entered')
    if (process.env.PI_ANNOTATE_TEST_STAGE === 'capture') {
      const elapsed = setTimeout(() => mark('capture-held-past-deadline'), 6100)
      await gate('capture-release')
      clearTimeout(elapsed)
    }
    const image = await capture(...args)
    mark('capture-settled', { bytes: image.toPNG().length })
    return image
  }
  globalThis.fixtureCaptures = () => captures
  window.webContents.on('destroyed', () => mark('contents-destroyed'))
  await window.loadURL('openchamber-ui://app/__splash')
  await window.loadURL('openchamber-ui://app/index.html')
  mark('window-ready', { visible: window.isVisible() })
}).catch(error => { console.error(error); app.quit() })
