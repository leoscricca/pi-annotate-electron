const { app, ipcMain } = require('electron')
const path = require('node:path')
const { bootSyntheticWorkspace, requireCondition, rendererUrl } = require('./bootstrap.cjs')
const { parseBoot, parseOwner, parseRenderer, admitRenderer } = require('./protocol.cjs')
const { AnnotationController } = require('./controller.cjs')

let owner
let window
let generation = 0
let started = false
let retiring = false
let controller
let annotationQuitReady = false
const channel = 'cnc:electron-annotation'
function send(value) { if (process.connected) process.send({ version: 1, target: owner.target, ...value }) }
function status() {
  let phase = window ? 'idle' : 'booting'
  if (controller) phase = controller.lane.status().phase
  if (retiring) phase = 'retired'
  return { phase, generation, target: owner.target,
    windowId: window?.id ?? null, hidden: window ? !window.isVisible() && !window.isFocused() : true }
}
ipcMain.handle(channel, (event, value) => {
  requireCondition(admitRenderer(event, window, rendererUrl), 'ANNOTATION_SENDER_REFUSED')
  const packet = parseRenderer(value)
  if (packet.kind === 'hello') return { version: 1, scope: 'synthetic-annotation' }
  if (packet.kind === 'status') return status()
  if (!controller || retiring) throw new Error('ANNOTATION_TARGET_RETIRED')
  return controller.receive(packet)
})

process.on('message', value => {
  if (!owner) {
    try { owner = parseBoot(value) }
    catch { app.quit(); return }
    void start().catch(() => { send({ kind: 'error', code: 'ANNOTATION_BOOT_REFUSED' }); app.quit() })
    return
  }
  let command
  try { command = parseOwner(value, owner) }
  catch (error) {
    const request = typeof value?.request === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(value.request) ? value.request : null
    send({ kind: 'refused', request, code: error.message }); return
  }
  if (command.kind === 'status') {
    send({ kind: 'reply', request: command.request, value: status() }); return
  }
  if (command.kind === 'start' || command.kind === 'cancel') {
    if (retiring || !controller || command.generation !== generation) {
      send({ kind: 'refused', request: command.request, code: 'ANNOTATION_STALE_GENERATION' }); return
    }
    const operation = command.kind === 'start' ? controller.start(command) : controller.cancel(command)
    void operation.then(value => send({ kind: 'reply', request: command.request, value }),
      () => send({ kind: 'refused', request: command.request, code: 'ANNOTATION_REQUEST_FAILED' }))
    return
  }
  if (command.kind === 'shutdown') {
    retiring = true
    send({ kind: 'reply', request: command.request, value: { phase: 'closing' } })
    app.quit()
    return
  }
  send({ kind: 'refused', request: command.request, code: 'ANNOTATION_OPERATION_REFUSED' })
})

async function start() {
  requireCondition(!started && typeof process.send === 'function' && process.connected, 'ANNOTATION_PARENT_REFUSED')
  started = true
  await bootSyntheticWorkspace({
    preloadFile: path.join(__dirname, 'runtime-preload.cjs'),
    onWindow(candidate, context) {
      window = candidate
      controller = new AnnotationController({ window: candidate, context, generation: () => generation, target: owner.target, session: owner.session })
      candidate.webContents.on('did-start-navigation', details => {
        if (!details.isMainFrame) return
        generation += 1
        if (generation > 1) { retiring = true; send({ kind: 'retired' }); void controller.retireNavigation().catch(() => {}) }
      })
      candidate.webContents.once('did-finish-load', () => {
        void (async () => {
          requireCondition(candidate.webContents.getURL() === rendererUrl && !retiring, 'ANNOTATION_DOCUMENT_REFUSED')
          const preferences = candidate.webContents.getLastWebPreferences()
          requireCondition(preferences.sandbox === true && preferences.contextIsolation === true
            && preferences.nodeIntegration === false, 'ANNOTATION_PERMISSIONS_REFUSED')
          candidate.setTitle('CnC Mendix Agent - synthetic annotation workspace')
          await candidate.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code: `(() => {
            const badge = document.createElement('div'); badge.id = 'cnc-annotation-synthetic';
            badge.textContent = 'Synthetic annotation workspace';
            badge.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:3px 8px;background:#fef3c7;color:#451a03;font:12px system-ui;pointer-events:none';
            document.body.appendChild(badge);
          })()` }])
          if (owner.foreground) {
            app.setActivationPolicy('regular'); app.dock.show(); app.show()
            candidate.setFocusable(true); candidate.setSkipTaskbar(false); candidate.show(); candidate.focus()
          }
          const appWorld = await candidate.webContents.executeJavaScript("({ bridge: typeof window.__CNC_ELECTRON_ANNOTATION__, node: typeof window.require })")
          const isolatedStatus = await candidate.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code: `(async () => {
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
              if (window.__CNC_ELECTRON_ANNOTATION__) return window.__CNC_ELECTRON_ANNOTATION__.status();
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            throw new Error('ANNOTATION_PRELOAD_UNAVAILABLE');
          })()` }])
          send({ kind: 'ready', value: { ...status(), appWorld, isolatedStatus, permissions: { sandbox: true, contextIsolation: true, nodeIntegration: false },
            home: context.home, profile: context.profile, synthetic: true,
            debug: { renderer: app.commandLine.hasSwitch('remote-debugging-port'), inspector: process.execArgv.some(v => v.startsWith('--inspect')) } } })
        })().catch(() => { send({ kind: 'error', code: 'ANNOTATION_DOCUMENT_REFUSED' }); app.quit() })
      })
      candidate.once('closed', () => { retiring = true; send({ kind: 'retired' }); void controller.retire().catch(() => {}) })
    },
  })
}

app.on('before-quit', event => {
  if (annotationQuitReady || !controller?.lane.current) return
  event.preventDefault()
  retiring = true
  void controller.retire().then(() => { annotationQuitReady = true; app.quit() }, () => {
    // Retain the target and evidence. An uncertain cleanup cannot authorize exit.
  })
})
process.once('disconnect', () => { retiring = true; app.quit() })
app.once('will-quit', () => ipcMain.removeHandler(channel))
if (typeof process.send !== 'function') app.quit()
