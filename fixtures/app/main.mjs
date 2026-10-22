import { app, BrowserWindow, session, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const renderer = path.join(directory, '../renderer/index.html')
const rendererUrl = pathToFileURL(renderer).href
const hidden = process.argv.includes('--e2e-hidden')
const legacy = process.argv.includes('--e2e-conversation-fixture')
const testHome = process.env.CNC_MENDIX_E2E_HOME
if (testHome) {
  if (!path.isAbsolute(testHome) || process.env.HOME !== testHome) throw new Error('FIXTURE_HOME_REFUSED')
  app.setPath('home', testHome)
}
if (hidden) app.setActivationPolicy('prohibited')
await app.whenReady()
session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
session.defaultSession.setPermissionCheckHandler(() => false)
const window = new BrowserWindow({ width: 1440, height: 900, show: !hidden, focusable: !hidden,
  webPreferences: { preload: path.join(directory, '../preload/index.cjs'), contextIsolation: true, sandbox: true,
    nodeIntegration: false, additionalArguments: legacy ? ['--annotation-fixture-legacy'] : [] } })
// Fixed counters make an escaped product click observable without a product backend.
const operations = []
Object.defineProperty(globalThis, '__ANNOTATION_FIXTURE_OPERATIONS__', { get: () => operations.slice() })
const allowedOperations = new Set(['new-session', 'send-input', 'connect', 'saved-login', 'live-session'])
for (const operation of allowedOperations) {
  ipcMain.handle('conversation:' + operation, (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame.url !== rendererUrl || args.length !== 0) throw new Error('FIXTURE_OPERATION_REFUSED')
    if (operations.length >= 200) throw new Error('FIXTURE_OPERATION_LIMIT')
    operations.push(operation)
    return { accepted: true }
  })
}
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
window.webContents.on('will-navigate', (event, value) => { if (value !== rendererUrl) event.preventDefault() })
await window.loadFile(renderer)
app.on('window-all-closed', () => app.quit())
