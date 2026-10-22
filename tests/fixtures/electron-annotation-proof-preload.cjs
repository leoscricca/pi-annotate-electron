// Development proof only. Never registered by the product entry.
const { contextBridge, ipcRenderer } = require('electron')

if (process.isMainFrame) {
  let active = false
  let escape = () => {}
  const overlayTarget = target => target instanceof Element && !!target.closest('#pi-panel, .pi-note-card')
  const keyGuard = event => {
    if (!active) return
    event.stopImmediatePropagation()
    if (event.key === 'Escape') { event.preventDefault(); escape(); return }
    if (!overlayTarget(event.target)) event.preventDefault()
  }
  const pointerGuard = event => {
    if (active && !overlayTarget(event.target)) { event.preventDefault(); event.stopImmediatePropagation() }
  }
  const focusGuard = event => {
    if (active && (overlayTarget(event.target) || overlayTarget(event.relatedTarget))) event.stopImmediatePropagation()
  }
  window.addEventListener('keydown', keyGuard, true)
  for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) window.addEventListener(name, pointerGuard, true)
  for (const name of ['focusin', 'focusout']) window.addEventListener(name, focusGuard, true)

  void ipcRenderer.invoke('cnc:annotation-proof', { kind: 'hello' }).then(reply => {
    if (reply?.version !== 1 || reply?.scope !== 'synthetic-proof') return
    contextBridge.exposeInIsolatedWorld(1004, '__CNC_ANNOTATION_PROOF_BRIDGE__', {
      message: value => ipcRenderer.invoke('cnc:annotation-proof', value),
      guard: value => { active = value === true },
      onEscape: callback => { escape = callback },
    })
  })
}
