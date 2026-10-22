const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { createDevelopmentBridge, ConnectionRefusal } = require('./connection.cjs')
const { createAttachedController, CAPABILITIES } = require('./controller.cjs')

const CHANNEL = 'cnc:development-ui'
function refused() { throw new Error('DEV_UI_RENDERER_REFUSED') }
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
function documentUrl(value) {
  try { const url = new URL(value); url.hash = ''; return url.href }
  catch { return null }
}
async function installDevelopmentUi({ app, ipcMain, session, repositoryRoot, directory }) {
  if (app.isPackaged || process.platform !== 'darwin') throw new Error('DEV_UI_DEVELOPMENT_ONLY')
  const windows = new Map()
  const byContents = new Map()
  let stopped = false
  let bridge
  let preload
  let installed = false
  let closing
  function trusted(state, sender, frame) {
    try {
      return !stopped && state && !state.window.isDestroyed() && !state.contents.isDestroyed()
        && sender === state.contents && frame === state.contents.mainFrame
        && documentUrl(frame.url) === state.expected && documentUrl(state.contents.getURL()) === state.expected
    } catch { return false }
  }
  function current(state, generation) {
    try { return !stopped && state.generation === generation && trusted(state, state.contents, state.contents.mainFrame) }
    catch { return false }
  }
  async function renderer(event, value) {
    const state = byContents.get(event.sender.id)
    if (!trusted(state, event.sender, event.senderFrame)) refused()
    if (exact(value, ['kind']) && value.kind === 'hello') {
      return { instance: bridge.instance, window: state.id, generation: state.generation, permit: state.permit }
    }
    if (!exact(value, ['kind', 'window', 'generation', 'permit', 'connection', 'payload']) || value.kind !== 'event'
      || value.window !== state.id || value.generation !== state.generation || value.permit !== state.permit
      || state.controllerGeneration !== state.generation || value.connection !== state.controllerConnection || !state.controller?.receive) refused()
    try {
      if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)
        || Buffer.byteLength(JSON.stringify(value.payload)) > 256 * 1024) refused()
    } catch { refused() }
    const controller = state.controller
    const generation = state.generation
    const result = await controller.receive(value.payload)
    if (!trusted(state, event.sender, event.senderFrame) || state.generation !== generation || state.controller !== controller
      || state.controllerConnection !== value.connection || state.permit !== value.permit) refused()
    return result
  }
  try {
    ipcMain.handle(CHANNEL, renderer); installed = true
    bridge = await createDevelopmentBridge({ directory,
      targets: () => [...windows.values()].filter(state => !state.loading && !state.closing && current(state, state.generation))
        .map(state => ({ window: state.id, generation: state.generation, capabilities: [...CAPABILITIES] })),
      async openTarget(binding, emit) {
        const state = windows.get(binding.window)
        if (!state || !current(state, binding.generation)) throw new ConnectionRefusal('STALE_TARGET')
        const controller = await createAttachedController({ window: state.window, contents: state.contents, binding, emit,
          repositoryRoot, isCurrent: () => current(state, binding.generation),
          onRevoked: reason => { void bridge.revoke(state.id, reason).catch(() => console.error('Development UI cleanup is unresolved.')) } })
        state.controller = controller; state.controllerGeneration = binding.generation; state.controllerConnection = binding.connection
        return {
          execute: (action, params, request) => controller.execute(action, params, request),
          async close(reason) {
            if (state.controller === controller) {
              state.controller = undefined; state.controllerGeneration = undefined; state.controllerConnection = undefined
            }
            await controller.close(reason)
          },
        }
      },
    })
    preload = session.defaultSession.registerPreloadScript({ type: 'frame', filePath: path.join(repositoryRoot, 'scripts/electron-development-ui/preload.cjs') })
  } catch (error) {
    if (installed) ipcMain.removeHandler(CHANNEL)
    if (preload) session.defaultSession.unregisterPreloadScript(preload)
    if (bridge) await bridge.close()
    throw error
  }
  const host = {
    registerWindow(window, target) {
      if (stopped) throw new Error('DEV_UI_HOST_CLOSED')
      const contents = window.webContents
      if (byContents.has(contents.id)) throw new Error('DEV_UI_WINDOW_ALREADY_REGISTERED')
      const state = { id: `w-${randomUUID()}`, window, contents, loading: true, generation: 1, permit: randomUUID(),
        expected: documentUrl(target.kind === 'file' ? pathToFileURL(target.value).href : target.value) }
      const revoke = reason => { void bridge.revoke(state.id, reason).catch(() => console.error('Development UI cleanup is unresolved.')) }
      const navigate = details => {
        if (!details.isMainFrame || details.isSameDocument) return
        state.loading = true; state.generation++; state.permit = randomUUID(); revoke('DOCUMENT_CHANGED')
      }
      const loaded = () => { state.loading = false }
      const close = event => {
        if (stopped || state.closeReady) return
        event.preventDefault()
        if (state.closing) return
        state.closing = bridge.revoke(state.id, 'TARGET_CLOSED', { waitForSettlement: true })
        state.closing.then(() => {
          state.closeReady = true
          if (!window.isDestroyed()) window.close()
        }, () => console.error('Development UI window close is blocked by unresolved owned cleanup.'))
      }
      const destroyed = () => {
        state.loading = true; state.generation++; state.permit = randomUUID(); revoke('TARGET_CLOSED')
        windows.delete(state.id); byContents.delete(contents.id)
      }
      const crashed = () => { state.loading = true; state.generation++; state.permit = randomUUID(); revoke('RENDERER_GONE') }
      window.on('close', close)
      contents.on('did-start-navigation', navigate)
      contents.on('did-finish-load', loaded)
      contents.on('destroyed', destroyed)
      contents.on('render-process-gone', crashed)
      state.detach = () => {
        window.off('close', close)
        contents.off('did-start-navigation', navigate); contents.off('did-finish-load', loaded)
        contents.off('destroyed', destroyed); contents.off('render-process-gone', crashed)
      }
      windows.set(state.id, state); byContents.set(contents.id, state)
    },
    close() {
      if (!closing) {
        stopped = true
        ipcMain.removeHandler(CHANNEL)
        session.defaultSession.unregisterPreloadScript(preload)
        for (const state of windows.values()) state.detach()
        windows.clear(); byContents.clear()
        closing = bridge.close({ waitForSettlement: true })
      }
      return closing
    },
  }
  return host
}
module.exports = { installDevelopmentUi }
