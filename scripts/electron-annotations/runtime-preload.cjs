const { contextBridge, ipcRenderer } = require('electron')

if (process.isMainFrame) {
  let active = false
  let escape = () => {}
  let select = () => {}
  const own = target => target instanceof Element && !!target.closest('#pi-panel, .pi-note-card')
  window.addEventListener('keydown', event => {
    if (!active) return
    event.stopImmediatePropagation()
    if (event.key === 'Escape') { event.preventDefault(); escape(); return }
    if (!own(event.target)) {
      event.preventDefault()
      if (event.key === 'Enter' || event.key === ' ') select()
    }
  }, true)
  for (const name of ['keypress', 'keyup']) window.addEventListener(name, event => {
    if (!active) return
    event.stopImmediatePropagation()
    if (!own(event.target)) event.preventDefault()
  }, true)
  for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'wheel']) window.addEventListener(name, event => {
    if (active && !own(event.target)) { event.preventDefault(); event.stopImmediatePropagation() }
  }, true)
  for (const name of ['focusin', 'focusout']) window.addEventListener(name, event => {
    if (active && (own(event.target) || own(event.relatedTarget))) event.stopImmediatePropagation()
  }, true)
  window.addEventListener('click', event => {
    if (active && event.target instanceof Element && event.target.closest('#pi-ss-full, #pi-debug-mode, #pi-etch-mode')) {
      event.preventDefault(); event.stopImmediatePropagation()
    }
  }, true)
  void ipcRenderer.invoke('cnc:electron-annotation', { kind: 'hello' }).then(reply => {
    if (reply?.version !== 1 || reply?.scope !== 'synthetic-annotation') return
    contextBridge.exposeInIsolatedWorld(1004, '__CNC_ELECTRON_ANNOTATION__', {
      status: () => ipcRenderer.invoke('cnc:electron-annotation', { kind: 'status' }),
      invoke: value => ipcRenderer.invoke('cnc:electron-annotation', value),
      guard: value => { active = value === true },
      onEscape: callback => { escape = callback },
      onSelect: callback => { select = callback },
    })
  }).catch(() => {}) // Admission failure exposes no API.
}
