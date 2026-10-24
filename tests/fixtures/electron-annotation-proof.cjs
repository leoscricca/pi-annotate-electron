// Fixed hidden proof, not a general application launcher or control server.
const { app, ipcMain, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createHash } = require('node:crypto')

const repo = path.resolve(__dirname, '../..')
const home = fs.realpathSync(process.env.CNC_MENDIX_E2E_HOME || '')
const root = path.dirname(home)
const profile = path.join(root, 'profile')
const expectedUrl = pathToFileURL(path.join(repo, 'out/renderer/index.html')).href
const resultPath = path.join(root, 'annotation-proof.json')
const channel = 'cnc:annotation-proof'
const world = 1004
const report = { success: false, steps: [], submissions: [], screenshotRequests: 0 }
let ownedWindow
let preloadId
let ran = false

function check(condition, message) { if (!condition) throw new Error(message) }
check(path.basename(root).startsWith('cnc-codex-desktop-') && home === path.join(root, 'home'), 'Proof home refused')
check(process.env.HOME === home && process.env.TMPDIR === path.join(root, 'tmp'), 'Proof environment refused')
check(process.argv.includes('--e2e-hidden') && process.argv.includes('--e2e-conversation-fixture'), 'Proof flags refused')
check(process.argv.includes(`--user-data-dir=${profile}`) && !app.isPackaged, 'Proof profile refused')
for (const name of ['home', 'profile', 'tmp']) {
  const stat = fs.lstatSync(path.join(root, name))
  check(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o700, 'Proof directory refused')
}
const marker = JSON.parse(fs.readFileSync(path.join(profile, 'conversation-fixture.json'), 'utf8'))
check(marker.version === 1 && marker.suite === 'synthetic-codex-v1' && marker.home === home && marker.profile === profile, 'Proof marker refused')
app.setPath('home', home)
if (process.platform === 'darwin') app.setActivationPolicy('prohibited')

ipcMain.handle(channel, (event, value) => {
  check(ownedWindow && event.sender === ownedWindow.webContents && event.senderFrame === event.sender.mainFrame
    && event.senderFrame.url === expectedUrl, 'Proof sender refused')
  check(value && typeof value === 'object' && !Array.isArray(value), 'Proof payload refused')
  if (value.kind === 'hello' && Object.keys(value).join(',') === 'kind') return { version: 1, scope: 'synthetic-proof' }
  if (value.kind === 'complete' && Object.keys(value).sort().join(',') === 'elements,kind') {
    check(Array.isArray(value.elements) && value.elements.length === 1, 'Proof selection refused')
    const note = value.elements[0]
    check(note && Object.keys(note).sort().join(',') === 'comment,selector,tag'
      && Object.values(note).every(v => typeof v === 'string' && v.length <= 4096), 'Proof note refused')
    report.submissions.push(note)
    return { accepted: true }
  }
  throw new Error('Proof operation refused')
})

const main = code => ownedWindow.webContents.executeJavaScript(code)
const isolated = code => ownedWindow.webContents.executeJavaScriptInIsolatedWorld(world, [{ code }])
async function until(read, label) {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    const result = await read()
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('Proof condition unavailable: ' + label)
}

async function proof() {
  const wc = ownedWindow.webContents
  await until(() => main("!!window.conversation && !!document.getElementById('composer-model')"), 'workspace')
  await until(() => isolated("typeof window.__CNC_ANNOTATION_PROOF_BRIDGE__ === 'object'"), 'isolated bridge')
  const preferences = wc.getLastWebPreferences()
  report.permissions = { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration }
  report.hidden = !ownedWindow.isVisible() && !ownedWindow.isFocused()
  report.paths = { home: app.getPath('home'), profile: app.getPath('userData') }
  report.debug = { renderer: app.commandLine.hasSwitch('remote-debugging-port'), inspector: process.execArgv.some(v => v.startsWith('--inspect')) }
  report.appWorld = await main("({ bridge: typeof window.__CNC_ANNOTATION_PROOF_BRIDGE__, node: typeof window.require, chromeId: window.chrome?.runtime?.id ?? null })")

  await main("document.getElementById('composer-model').click()")
  await until(() => main("[...document.querySelectorAll('[role=menuitem]')].some(el => el.textContent.trim() === 'Manage Codex connection')"), 'connection menu')
  await main("[...document.querySelectorAll('[role=menuitem]')].find(el => el.textContent.trim() === 'Manage Codex connection').click()")
  await until(() => main("[...document.querySelectorAll('[role=dialog] button')].some(el => el.textContent.trim() === 'Connect Codex')"), 'connection dialog')
  report.steps.push('synthetic connection settings open')

  const picker = fs.readFileSync(path.join(repo, 'node_modules/pi-annotate/chrome-extension/content.js'), 'utf8')
  check(createHash('sha256').update(picker).digest('hex') === 'a6833ff7e68d8b1572987079ddb82924bc9c148ff1fb9826134a4ccdce020d3d', 'Picker identity changed')
  await isolated(`(() => {
    const bridge = window.__CNC_ANNOTATION_PROOF_BRIDGE__;
    const listeners = [];
    const state = { pending: [], errors: [], before: null };
    const restore = () => { bridge.guard(false); if (state.before) { document.body.style.cursor = state.before.cursor; if (state.before.focus?.isConnected) state.before.focus.focus(); } };
    window.chrome = { runtime: { id: 'cnc-synthetic-proof', onMessage: { addListener: listener => listeners.push(listener) },
      sendMessage: message => {
        if (message.type === 'CAPTURE_SCREENSHOT') { state.errors.push('unexpected capture'); return Promise.reject(new Error('Proof capture disabled')); }
        if (message.type === 'CANCEL') { restore(); return Promise.resolve({ accepted: true }); }
        if (message.type !== 'ANNOTATIONS_COMPLETE' || message.result.editCapture || message.result.screenshot || message.result.screenshots.length) return Promise.reject(new Error('Proof result refused'));
        const pending = bridge.message({ kind: 'complete', elements: message.result.elements.map(element => ({ tag: element.tag, selector: element.selector, comment: element.comment })) });
        state.pending.push(pending); void pending.then(restore, error => { state.errors.push(String(error)); restore(); }); return pending;
      } } };
    const cancel = () => { for (const listener of listeners) listener({ type: 'CANCEL' }, {}, () => {}); restore(); };
    bridge.onEscape(cancel);
    window.__CNC_ANNOTATION_PROOF_CONTROL__ = { state, cancel, start: () => {
      if (document.getElementById('pi-panel')) throw new Error('Busy proof');
      state.before = { cursor: document.body.style.cursor, focus: document.activeElement };
      bridge.guard(true); for (const listener of listeners) listener({ type: 'START_ANNOTATION', requestId: 'proof-note' }, {}, () => {});
      for (const id of ['pi-ss-full','pi-debug-mode','pi-etch-mode']) { const element = document.getElementById(id); element.disabled = true; (element.closest('label') || element).hidden = true; }
      document.getElementById('pi-ss-none').click();
    } };
  })()`)
  await isolated(picker)
  await isolated("document.body.style.cursor = 'help'; window.__CNC_ANNOTATION_PROOF_CONTROL__.start()")
  report.restrictions = await isolated("({ full: document.getElementById('pi-ss-full').disabled, debug: document.getElementById('pi-debug-mode').disabled, etch: document.getElementById('pi-etch-mode').disabled, none: document.getElementById('pi-ss-none').classList.contains('active') })")
  await isolated(`(() => {
    const button = [...document.querySelectorAll('[role=dialog] button')].find(element => element.textContent.trim() === 'Connect Codex');
    const bounds = button.getBoundingClientRect(); const x = bounds.left + 3, y = bounds.top + bounds.height / 2;
    button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y })); button.click();
  })()`)
  await until(() => isolated("!!document.querySelector('.pi-note-textarea')"), 'picker note')
  report.input = await isolated(`(() => {
    const note = document.querySelector('.pi-note-textarea'); note.focus();
    note.value = 'Reduce the Settings button padding'; note.dispatchEvent(new Event('input', { bubbles: true }));
    return { text: note.value, focused: document.activeElement === note, selected: document.getElementById('pi-count').textContent };
  })()`)
  await isolated("document.getElementById('pi-submit').click()")
  await until(async () => report.submissions.length === 1, 'submitted note')
  await isolated('Promise.all(window.__CNC_ANNOTATION_PROOF_CONTROL__.state.pending)')
  report.afterSubmit = await isolated("({ overlay: !!document.getElementById('pi-panel'), cursor: document.body.style.cursor, errors: window.__CNC_ANNOTATION_PROOF_CONTROL__.state.errors })")
  report.dialogAfterSubmit = await main("[...document.querySelectorAll('[role=dialog] button')].some(element => element.textContent.trim() === 'Connect Codex')")
  await isolated('window.__CNC_ANNOTATION_PROOF_CONTROL__.start()')
  await main("document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))")
  report.afterEscape = await isolated("({ overlay: !!document.getElementById('pi-panel'), cursor: document.body.style.cursor })")
  report.dialogAfterEscape = await main("[...document.querySelectorAll('[role=dialog] button')].some(element => element.textContent.trim() === 'Connect Codex')")
  report.appWorldAfter = await main("({ bridge: typeof window.__CNC_ANNOTATION_PROOF_BRIDGE__, node: typeof window.require, chromeId: window.chrome?.runtime?.id ?? null })")
  report.success = true
}

app.on('browser-window-created', (_event, window) => {
  if (ownedWindow) return
  ownedWindow = window
  window.webContents.once('did-finish-load', () => {
    if (ran) return
    ran = true
    void proof().catch(error => { report.error = String(error.message).slice(0, 300) }).finally(() => {
      fs.writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      app.quit()
    })
  })
})
app.once('will-quit', () => { ipcMain.removeHandler(channel); if (preloadId) session.defaultSession.unregisterPreloadScript(preloadId) })
void app.whenReady().then(async () => {
  check(fs.realpathSync(app.getPath('home')) === home && fs.realpathSync(app.getPath('userData')) === profile, 'Resolved proof profile refused')
  preloadId = session.defaultSession.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'electron-annotation-proof-preload.cjs') })
  await import(pathToFileURL(path.join(repo, 'out/main/index.js')).href)
}).catch(error => {
  report.error = String(error.message).slice(0, 300)
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  app.quit()
})
