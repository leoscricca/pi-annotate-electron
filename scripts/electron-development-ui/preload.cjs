const { contextBridge, ipcRenderer } = require('electron')

// This script exists only in the separately registered development frame preload.
// The ordinary renderer receives no new API, token, socket, or process capability.
if (process.isMainFrame) {
  let active = false
  const inputState = { keys: 0, clicks: 0, selected: 0, hovered: 0, lastKey: '' }
  let select = () => {}
  let hover = () => {}
  let wheel = () => {}
  let escape = () => {}
  const own = target => target instanceof Element && !!target.closest('#pi-panel, .pi-note-card, #pi-markers')
  window.addEventListener('keydown', event => {
    if (!active) return
    inputState.keys += 1; inputState.lastKey = ['Escape', 'Enter', ' '].includes(event.key) ? event.key : 'other'
    event.stopImmediatePropagation()
    if (event.key === 'Escape') { event.preventDefault(); escape(); return }
    if (!own(event.target)) {
      event.preventDefault()
      if (event.key === 'Enter' || event.key === ' ') { inputState.selected += 1; select({ keyboard: true, shiftKey: event.shiftKey }) }
    }
  }, true)
  for (const type of ['keypress', 'keyup']) window.addEventListener(type, event => {
    if (!active) return
    event.stopImmediatePropagation()
    if (!own(event.target)) event.preventDefault()
  }, true)
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'dblclick', 'contextmenu', 'touchstart', 'touchend']) {
    window.addEventListener(type, event => { if (active && !own(event.target)) { event.preventDefault(); event.stopImmediatePropagation() } }, true)
  }
  window.addEventListener('mousemove', event => {
    if (active && !own(event.target)) { inputState.hovered += 1; event.stopImmediatePropagation(); hover({ x: event.clientX, y: event.clientY }) }
  }, true)
  window.addEventListener('wheel', event => {
    if (active && !own(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.altKey) wheel({ deltaY: event.deltaY })
    }
  }, { capture: true, passive: false })
  window.addEventListener('click', event => {
    if (active && !own(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation()
      inputState.clicks += 1; inputState.selected += 1
      select({ x: event.clientX, y: event.clientY, keyboard: false, shiftKey: event.shiftKey })
    }
  }, true)
  for (const type of ['focusin', 'focusout']) window.addEventListener(type, event => {
    if (active && (own(event.target) || own(event.relatedTarget))) event.stopImmediatePropagation()
  }, true)
  const channel = 'cnc:development-ui'
  void ipcRenderer.invoke(channel, { kind: 'hello' }).then(identity => {
    if (!identity || typeof identity !== 'object' || Object.keys(identity).sort().join(',') !== 'generation,instance,permit,window'
      || !Number.isSafeInteger(identity.generation) || identity.generation < 1
      || !['instance', 'window', 'permit'].every(key => typeof identity[key] === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(identity[key]))) return
    contextBridge.exposeInIsolatedWorld(1004, '__CNC_DEV_UI__', {
      guard(value) { active = value === true; if (active) Object.assign(inputState, { keys: 0, clicks: 0, selected: 0, hovered: 0, lastKey: '' }) },
      inputState() { return { ...inputState, active } },
      onSelect(callback) { select = callback },
      onHover(callback) { hover = callback },
      onWheel(callback) { wheel = callback },
      onEscape(callback) { escape = callback },
      post(connection, payload) {
        if (typeof connection !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(connection)) throw new Error('DEV_UI_RENDERER_REFUSED')
        return ipcRenderer.invoke(channel, { kind: 'event', window: identity.window, generation: identity.generation,
          permit: identity.permit, connection, payload })
      },
    })
  }).catch(() => { /* Unregistered or retired frames receive no development bridge. */ })
}
