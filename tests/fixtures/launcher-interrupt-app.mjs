import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(process.env.PI_ANNOTATE_TEST_PACKAGE)
const { app, BrowserWindow } = require('electron')
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
app.setActivationPolicy('prohibited')
app.on('before-quit', () => mark('before-quit'))
app.on('will-quit', () => mark('will-quit'))
app.on('quit', (_event, code) => mark('quit', { code }))
mark('entry', { pid: process.pid })
if (process.env.PI_ANNOTATE_TEST_STAGE === 'startup') {
  await gate('startup-release')
  mark('startup-settled')
} else {
  const window = new BrowserWindow({ width: 640, height: 480, show: false, focusable: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } })
  const capture = window.webContents.capturePage.bind(window.webContents)
  window.webContents.capturePage = async (...args) => {
    mark('capture-entered')
    const elapsed = setTimeout(() => mark('capture-held-past-deadline'), 6100)
    await gate('capture-release')
    clearTimeout(elapsed)
    const image = await capture(...args)
    mark('capture-settled', { bytes: image.toPNG().length })
    return image
  }
  window.webContents.on('destroyed', () => mark('contents-destroyed'))
  await window.loadFile(process.env.PI_ANNOTATE_RENDERER_FILE)
  mark('window-ready', { visible: window.isVisible() })
}
