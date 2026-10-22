const { ConnectionRefusal, OperationFailure } = require('./connection.cjs')
const { LIMITS } = require('./protocol.cjs')
const { installPage } = require('./page.cjs')
const { startDiagnostics } = require('./diagnostics.cjs')
const { createImageStore } = require('./images.cjs')
const { captureImage } = require('./capture.cjs')
const { createPicker } = require('./picker.cjs')

const CAPABILITIES = Object.freeze(['snapshot', 'input', 'diagnostics', 'screenshot', 'annotation'])
const KEY_CODES = Object.freeze({ Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9],
  Space: [' ', 32], Backspace: ['Backspace', 8], Delete: ['Delete', 46], ArrowLeft: ['ArrowLeft', 37],
  ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40],
  Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34] })
function keyEvent(input) {
  const parts = input.split('+'); const name = parts.pop()
  let modifiers = 0
  for (const part of parts) {
    const flag = ({ Alt: 1, Option: 1, Control: 2, Ctrl: 2, Meta: 4, Command: 4, Cmd: 4, Shift: 8 })[part]
    if (!flag) throw new OperationFailure('UNAVAILABLE', 'refused')
    modifiers |= flag
  }
  let entry = KEY_CODES[name]
  let code = name
  if (!entry && /^[A-Za-z0-9._-]$/.test(name)) {
    entry = [name, name.toUpperCase().charCodeAt(0)]
    if (/^[A-Za-z]$/.test(name)) code = `Key${name.toUpperCase()}`
    else if (/^[0-9]$/.test(name)) code = `Digit${name}`
  }
  if (!entry && /^F(?:[1-9]|1[0-2])$/.test(name)) entry = [name, 111 + Number(name.slice(1))]
  if (!entry) throw new OperationFailure('UNAVAILABLE', 'refused')
  const result = { key: entry[0], code, windowsVirtualKeyCode: entry[1], modifiers }
  if (!(modifiers & 7) && (entry[0].length === 1 || name === 'Enter')) {
    result.text = name === 'Enter' ? '\r' : entry[0]
    if ((modifiers & 8) && /^[a-z]$/.test(result.text)) { result.text = result.text.toUpperCase(); result.key = result.text }
  }
  return result
}

async function createAttachedController({ contents, binding, isCurrent, onRevoked, repositoryRoot, emit }) {
  if (!isCurrent()) throw new ConnectionRefusal('STALE_TARGET')
  const frontend = contents.debugger
  if (contents.isDevToolsOpened() || frontend.isAttached()) throw new ConnectionRefusal('UNAVAILABLE')
  frontend.attach('1.3')
  let ownsDebugger = true
  let closed = false
  let closePromise
  let diagnostics
  const owner = JSON.stringify(binding.connection)
  const images = createImageStore(binding.connection)
  const picker = createPicker({ contents, binding, emit, onRevoked, repositoryRoot, images, isCurrent: () => !closed && isCurrent() })
  const detached = () => {
    ownsDebugger = false
    if (!closed) { closed = true; onRevoked('DEBUGGER_DETACHED') }
  }
  frontend.on('detach', detached)
  function guard() {
    if (closed || !isCurrent()) throw new OperationFailure('STALE_TARGET', 'revoked')
  }
  async function world(method, params = {}) {
    guard()
    const code = `window.__CNC_DEV_UI_PAGE__?.call(${JSON.stringify(method)},${JSON.stringify(params)},${owner}) ?? ({ok:false,code:'STALE_REFERENCE'})`
    const result = await contents.executeJavaScriptInIsolatedWorld(1004, [{ code }])
    guard()
    if (!result.ok) throw new OperationFailure(result.code, 'refused')
    return result.value
  }
  async function send(method, params) {
    guard()
    const result = await frontend.sendCommand(method, params)
    guard()
    return result
  }
  async function input(action, params) {
    let attempted = false
    try {
      if (action === 'scroll') { attempted = true; return await world('scroll', params) }
      if (action === 'click') {
        const initial = await world('target', params)
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...initial })
        const point = await world('target', params)
        const button = params.button ?? 'left'
        for (let clickCount = 1; clickCount <= (params.count ?? 1); clickCount += 1) {
          const currentPoint = clickCount === 1 ? point : await world('target', params)
          guard(); attempted = true
          await Promise.all([send('Input.dispatchMouseEvent', { type: 'mousePressed', ...currentPoint, button, clickCount }),
            send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...currentPoint, button, clickCount })])
        }
      } else if (action === 'fill') {
        await world('focus', params)
        guard(); attempted = true
        const select = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: process.platform === 'darwin' ? 4 : 2 }
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...select, commands: ['selectAll'] })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...select })
        await send('Input.insertText', { text: params.text })
        if (await world('value', params) !== params.text) throw new OperationFailure('OPERATION_FAILED', 'unknown')
      } else {
        const event = keyEvent(params.key)
        guard(); attempted = true
        const released = { ...event }; delete released.text
        await Promise.all([send('Input.dispatchKeyEvent', { type: 'keyDown', ...event }),
          send('Input.dispatchKeyEvent', { type: 'keyUp', ...released })])
      }
      return { outcome: 'dispatched' }
    } catch (error) {
      if (error instanceof OperationFailure && (error.code === 'STALE_TARGET' || !attempted)) throw error
      throw new OperationFailure('OPERATION_FAILED', attempted ? 'unknown' : 'failed')
    }
  }
  const controller = {
    receive(payload) { return picker.receive(payload) },
    async execute(action, params, request) {
      guard()
      if (action === 'status') return picker.status()
      if (action === 'cancel') return picker.cancel(params.annotation)
      if (action === 'annotate') return picker.start(request, params.mode)
      if (picker.busy()) throw new OperationFailure('BUSY', 'refused')
      if (action === 'snapshot') return world('snapshot')
      if (action === 'screenshot') return captureImage(contents, params, value => world('geometry', value), () => !closed && isCurrent(), images)
      if (['console', 'exceptions', 'network'].includes(action)) return diagnostics.read(action === 'exceptions' ? 'exception' : action, params.clear)
      if (['click', 'fill', 'scroll', 'key'].includes(action)) return input(action, params)
      throw new OperationFailure('UNAVAILABLE', 'refused')
    },
    close() {
      if (!closePromise) {
        closed = true
        diagnostics?.stop()
        closePromise = (async () => {
          let failure
          try { await picker.close() } catch (error) { failure = error }
          try {
            if (!contents.isDestroyed()) {
              const code = `(() => {const api=window.__CNC_DEV_UI_PAGE__;if(!api)return true;if(api.connection!==${owner})return false;return api.call('close',{},${owner}).ok})()`
              const removed = await contents.executeJavaScriptInIsolatedWorld(1004, [{ code }])
              if (!removed) throw new OperationFailure('CLEANUP_BLOCKED', 'blocked')
            }
          } catch (error) { failure ??= error }
          frontend.off('detach', detached)
          if (ownsDebugger) {
            ownsDebugger = false
            try { if (!contents.isDestroyed() && frontend.isAttached()) frontend.detach() }
            catch (error) { failure ??= error }
          }
          if (failure) throw failure
        })()
      }
      return closePromise
    },
  }
  try {
    guard()
    await contents.executeJavaScriptInIsolatedWorld(1004, [{ code:
      `(${installPage.toString()})(${JSON.stringify({ nodes: LIMITS.nodes, bytes: LIMITS.result - 65536 })},${owner})` }])
    guard()
    diagnostics = await startDiagnostics(frontend, () => !closed && isCurrent())
    guard()
    return controller
  } catch {
    await controller.close()
    throw new ConnectionRefusal(isCurrent() ? 'UNAVAILABLE' : 'STALE_TARGET')
  }
}
module.exports = { createAttachedController, CAPABILITIES }
