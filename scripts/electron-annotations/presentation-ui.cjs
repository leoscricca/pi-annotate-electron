// Serialized into the owned isolated world by presentationSource.
function installPresentation(css, icons) {
  let panel, notes, markers, observer, resizeObserver, state, colorStyle, modalObserver
  let defaultScreenshot = false, selecting = true, visible = true, syncing = false, restoring = false
  let history = [], historyIndex = 0, detailsId = 0
  const decorated = new WeakSet()
  let layers = []
  let modalInterrupted = false
  let dockDrag = null, dockMoved = false
  const selectionColors = new WeakMap()
  const palette = ['rosewater','flamingo','pink','mauve','red','maroon','peach','yellow','green','teal','sky','sapphire','blue','lavender']
    .map(name => `var(--pi-cat-${name})`)
  let colorCycle = []
  function shuffleColors() {
    const values = palette.map((_, index) => index)
    for (let i = values.length - 1; i > 0; i--) {
      const next = Math.floor(Math.random() * (i + 1))
      ;[values[i], values[next]] = [values[next], values[i]]
    }
    return values
  }
  const svg = name => {
    const node = new DOMParser().parseFromString(icons[name], 'image/svg+xml').querySelector('svg')
    node.setAttribute('aria-hidden', 'true')
    return node
  }
  const icon = (node, name, label) => {
    node.replaceChildren(svg(name))
    node.setAttribute('aria-label', label)
    node.title = label
  }
  const button = (className, name, label) => {
    const node = document.createElement('button')
    node.type = 'button'; node.className = className
    icon(node, name, label)
    return node
  }
  const cards = () => [...notes.querySelectorAll('.pi-note-card')]
  const status = text => { panel.querySelector('.pi-cnc-status').textContent = text }
  function fitCards() {
    if (!panel?.isConnected) return
    const bottom = dockMoved ? innerHeight - 8 : panel.getBoundingClientRect().top - 8
    for (const card of cards()) {
      if (card.classList.contains('dragging')) continue
      const box = card.getBoundingClientRect()
      card.style.left = `${Math.max(8, Math.min(box.x, innerWidth - box.width - 8))}px`
      if (card.style.bottom && card.style.bottom !== 'auto') {
        const edge = Math.min(bottom, box.bottom)
        card.style.bottom = `${innerHeight - edge}px`
        card.style.maxHeight = `${Math.max(80, edge - 8)}px`
      } else {
        card.style.top = `${Math.max(8, Math.min(box.y, bottom - box.height))}px`
      }
    }
  }
  function positionDock(x, y) {
    const box = panel.getBoundingClientRect()
    panel.style.transform = 'none'; panel.style.bottom = 'auto'
    panel.style.left = `${Math.max(8, Math.min(x, innerWidth - box.width - 8))}px`
    panel.style.top = `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`
  }
  function onDockDown(event) {
    if (!panel?.isConnected || !panel.contains(event.target) || event.button !== 0 || dockDrag || event.target.closest('button,input,textarea')) return
    const box = panel.getBoundingClientRect()
    dockDrag = { pointer: event.pointerId, x: event.clientX - box.x, y: event.clientY - box.y }
    panel.setPointerCapture(event.pointerId)
    panel.classList.add('pi-cnc-dragging')
    event.preventDefault(); event.stopImmediatePropagation()
  }
  function onDockMove(event) {
    if (!dockDrag || event.pointerId !== dockDrag.pointer) return
    dockMoved = true
    positionDock(event.clientX - dockDrag.x, event.clientY - dockDrag.y)
    event.preventDefault(); event.stopImmediatePropagation()
  }
  function endDockDrag() {
    if (!dockDrag) return
    const pointer = dockDrag.pointer
    dockDrag = null
    panel.classList.remove('pi-cnc-dragging')
    if (panel.hasPointerCapture(pointer)) panel.releasePointerCapture(pointer)
  }
  function onDockUp(event) {
    if (!dockDrag || event.pointerId !== dockDrag.pointer) return
    endDockDrag()
    event.preventDefault(); event.stopImmediatePropagation()
  }
  function colorSelections(snapshot) {
    // Reserve known colors before assigning new ones, including restored cards.
    const reserved = new Map()
    for (const entry of snapshot.entries) {
      const annotation = entry.card || entry.element, slot = selectionColors.get(annotation)
      if (slot !== undefined && !reserved.has(slot)) reserved.set(slot, annotation)
    }
    const used = new Set(reserved.keys())
    const rules = snapshot.entries.map((entry, index) => {
      const annotation = entry.card || entry.element
      let slot = selectionColors.get(annotation)
      if (slot === undefined || reserved.get(slot) !== annotation) {
        let next = colorCycle.findIndex(value => !used.has(value))
        if (next < 0) { colorCycle = shuffleColors(); next = colorCycle.findIndex(value => !used.has(value)) }
        slot = colorCycle.splice(next, 1)[0]
        selectionColors.set(annotation, slot)
      }
      used.add(slot)
      return `.pi-note-card[data-index="${index}"],#pi-markers .pi-marker-badge[data-index="${index}"],#pi-markers .pi-marker-outline:nth-child(${index * 2 + 1}){--pi-note-accent:${palette[slot]}}`
    }).join('\n')
    // Marker nodes are rebuilt by the picker. Keep updates on a stable owned
    // root so queued records on removed nodes cannot resemble product edits.
    if (colorStyle.textContent !== rules) colorStyle.textContent = rules
  }
  function setScreenshot(card, include) {
    const control = card.querySelector('.pi-note-screenshot')
    if (control.classList.contains('active') !== include) control.click()
  }
  function syncScreenshotMode() {
    const include = cards().some(card => card.querySelector('.pi-note-screenshot').classList.contains('active'))
    const mode = document.getElementById(include ? 'pi-ss-each' : 'pi-ss-none')
    if (!mode.classList.contains('active')) mode.click()
  }
  function sameSelections(left, right) {
    return left.entries.length === right.entries.length && left.entries.every((entry, index) =>
      entry.element === right.entries[index].element && entry.selector === right.entries[index].selector)
  }
  function record() {
    const next = state.snapshot()
    if (restoring) return
    if (sameSelections(history[historyIndex], next)) history[historyIndex] = next
    else {
      history.splice(historyIndex + 1)
      history.push(next)
      if (history.length > 50) history.shift()
      historyIndex = history.length - 1
    }
  }
  function restore(offset) {
    sync()
    const index = historyIndex + offset
    if (index < 0 || index >= history.length) return
    restoring = true
    try {
      const live = state.snapshot()
      const target = { ...history[index], entries: history[index].entries.map(entry => {
        const surviving = live.entries.find(value => value.element === entry.element && value.selector === entry.selector)
        return surviving ? { ...entry, comment: surviving.comment, screenshot: surviving.screenshot, card: surviving.card } : entry
      }) }
      state.restore(target)
      historyIndex = index
      history[index] = state.snapshot()
      visible = true
      status(offset < 0 ? 'Annotation change undone' : 'Annotation change restored')
      sync()
    } catch { status('Cannot restore annotation: selected element changed.') }
    finally { restoring = false }
    updateControls()
    fitCards()
  }
  function updateControls() {
    const count = state.snapshot().entries.length
    document.getElementById('pi-count').textContent = String(count)
    document.getElementById('pi-count').setAttribute('aria-label', `${count} annotations`)
    document.getElementById('pi-submit').disabled = count === 0
    panel.querySelector('.pi-cnc-undo').disabled = historyIndex === 0
    panel.querySelector('.pi-cnc-redo').disabled = historyIndex === history.length - 1
    const select = panel.querySelector('.pi-cnc-select')
    select.setAttribute('aria-pressed', String(selecting))
    const visibility = panel.querySelector('.pi-cnc-visibility')
    const label = visible ? 'Hide annotations' : 'Show annotations'
    if (visibility.getAttribute('aria-label') !== label) icon(visibility, visible ? 'eye-line' : 'eye-off-line', label)
    visibility.setAttribute('aria-pressed', String(visible))
    for (const node of [notes, markers, document.getElementById('pi-highlight'), document.getElementById('pi-tooltip')]) node?.classList.toggle('pi-cnc-hidden', !visible)
  }
  function updateDetails(card, entry) {
    const region = card.querySelector('.pi-cnc-details')
    if (region.hidden) return
    const target = entry.element
    const box = target.getBoundingClientRect()
    const values = { tag: target.tagName.toLowerCase(), selector: entry.selector,
      classes: [...target.classList].join(' ') || 'None', size: `${Math.round(box.width)} × ${Math.round(box.height)} px` }
    for (const [name, value] of Object.entries(values)) {
      const node = region.querySelector(`[data-fact="${name}"]`)
      const text = value.slice(0, 2048)
      if (node.textContent !== text) node.textContent = text
    }
  }
  function toggleDetails(card) {
    const region = card.querySelector('.pi-cnc-details')
    const edge = card.getBoundingClientRect().bottom
    region.hidden = !region.hidden
    const control = card.querySelector('.pi-cnc-details-toggle')
    control.setAttribute('aria-expanded', String(!region.hidden))
    control.setAttribute('aria-label', region.hidden ? 'Show element details' : 'Hide element details')
    control.title = control.getAttribute('aria-label')
    // Grow upward with a constrained flex body, keeping the clicked footer still.
    card.style.top = 'auto'
    card.style.bottom = `${innerHeight - edge}px`
    card.style.maxHeight = `${Math.max(80, edge - 8)}px`
    sync()
    fitCards()
  }
  function minimize(card, value) {
    const top = card.getBoundingClientRect().top
    card.style.bottom = 'auto'
    card.style.top = `${top}px`
    card.style.maxHeight = ''
    card.classList.toggle('pi-cnc-minimized', value)
    const control = card.querySelector('.pi-cnc-minimize')
    icon(control, value ? 'add-line' : 'subtract-line', value ? 'Expand annotation' : 'Minimize annotation')
    control.setAttribute('aria-expanded', String(!value))
    fitCards()
  }
  function decorate(card) {
    decorated.add(card)
    const text = card.querySelector('.pi-note-textarea')
    text.setAttribute('aria-label', 'Feedback')
    text.placeholder = 'Describe the change you’d like to make…'
    const minimizeButton = button('pi-cnc-minimize', 'subtract-line', 'Minimize annotation')
    minimizeButton.setAttribute('aria-expanded', 'true')
    minimizeButton.addEventListener('click', () => minimize(card, !card.classList.contains('pi-cnc-minimized')))
    const header = card.querySelector('.pi-note-header')
    header.append(minimizeButton)
    header.addEventListener('mousedown', () => {
      const box = card.getBoundingClientRect()
      card.style.top = `${box.top}px`; card.style.bottom = 'auto'; card.style.maxHeight = ''
    }, true)
    const region = document.createElement('section')
    region.className = 'pi-cnc-details'; region.id = `pi-element-details-${++detailsId}`
    region.setAttribute('role', 'region'); region.setAttribute('aria-label', 'Selected element details'); region.hidden = true
    const list = document.createElement('dl')
    for (const [key, title] of [['tag', 'Tag'], ['selector', 'Selector'], ['classes', 'Classes'], ['size', 'Size']]) {
      const label = document.createElement('dt'); label.textContent = title
      const value = document.createElement('dd'); value.dataset.fact = key
      list.append(label, value)
    }
    region.append(list)
    const hierarchy = document.createElement('div'); hierarchy.className = 'pi-cnc-hierarchy'
    for (const [selector, label] of [['.pi-note-expand', 'Expand to parent'], ['.pi-note-contract', 'Contract to child']]) {
      const control = card.querySelector(selector); icon(control, 'arrow-down-s', label); hierarchy.append(control)
    }
    card.querySelector('.pi-note-body').append(region)
    const footer = document.createElement('footer'); footer.className = 'pi-cnc-footer'
    const screenshot = card.querySelector('.pi-note-screenshot')
    icon(screenshot, 'image-line', 'Add screenshot')
    const caption = document.createElement('span'); caption.className = 'pi-cnc-image-caption'; screenshot.append(caption)
    const detailsButton = button('pi-cnc-details-toggle', 'code-s-slash-line', 'Show element details')
    detailsButton.setAttribute('aria-expanded', 'false'); detailsButton.setAttribute('aria-controls', region.id)
    detailsButton.addEventListener('click', () => toggleDetails(card))
    const remove = card.querySelector('.pi-note-close'); icon(remove, 'delete-bin-6-line', 'Delete annotation')
    footer.append(screenshot, hierarchy, detailsButton, remove); card.append(footer)
    resizeObserver.observe(card)
    setScreenshot(card, defaultScreenshot)
    const dock = panel.getBoundingClientRect(), height = card.getBoundingClientRect().height
    card.style.top = `${Math.max(8, Math.min(dock.top - 8 - height >= 8 ? dock.top - 8 - height : dock.bottom + 8, innerHeight - height - 8))}px`
  }
  function sync() {
    if (!panel?.isConnected || syncing) return
    syncing = true
    try {
      for (const card of cards()) if (!decorated.has(card)) decorate(card)
      syncScreenshotMode()
      const snapshot = state.snapshot()
      colorSelections(snapshot)
      for (const card of cards()) {
        const entry = snapshot.entries[Number(card.dataset.index)]
        if (!entry) continue
        const selector = card.querySelector('.pi-note-selector')
        const target = entry.element
        // Rendered text excludes hidden product content.
        const name = target.getAttribute('aria-label') || target.innerText || target.tagName.toLowerCase()
        if (selector.textContent !== name.slice(0, 128)) selector.textContent = name.slice(0, 128)
        const screenshot = card.querySelector('.pi-note-screenshot')
        const include = screenshot.classList.contains('active')
        screenshot.setAttribute('aria-pressed', String(include))
        screenshot.setAttribute('aria-label', include ? 'Remove screenshot' : 'Add screenshot')
        if (screenshot.title !== screenshot.getAttribute('aria-label')) screenshot.title = screenshot.getAttribute('aria-label')
        const caption = screenshot.querySelector('.pi-cnc-image-caption')
        if (caption.textContent !== (include ? 'Element crop' : 'Add screenshot')) caption.textContent = include ? 'Element crop' : 'Add screenshot'
        updateDetails(card, entry)
      }
      record()
      updateControls()
    } finally { syncing = false }
  }
  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null
    if (!target || !panel?.isConnected) return
    if (target.closest('.pi-note-screenshot') && !syncing && !restoring) history.splice(historyIndex + 1)
    if (target.closest('#pi-ss-none')) for (const card of cards()) setScreenshot(card, false)
    sync()
    fitCards()
  }
  function onInput(event) {
    if (!panel?.isConnected) return
    const text = event.target
    if (text instanceof HTMLTextAreaElement && text.matches('.pi-note-textarea') && parseFloat(text.style.height) < 159) text.style.height = '159px'
    history.splice(historyIndex + 1)
    sync()
  }
  function onResize() {
    if (dockMoved && panel?.isConnected) { const box = panel.getBoundingClientRect(); positionDock(box.x, box.y) }
    sync(); fitCards()
  }
  function onModalChange() {
    if (!modalInterrupted && panel?.isConnected && document.querySelector('dialog:modal')) {
      modalInterrupted = true
      document.getElementById('pi-close').click()
    }
  }
  function onMarker(event) {
    const badge = event.target instanceof Element ? event.target.closest('.pi-marker-badge') : null
    if (!badge) return
    event.preventDefault(); event.stopImmediatePropagation()
    const card = cards().find(value => value.dataset.index === badge.dataset.index)
    if (card) { visible = true; minimize(card, false); sync() }
  }
  window.__CNC_ANNOTATION_PRESENTATION__ = {
    dockPointerDown: onDockDown,
    start(options = {}) {
      if (document.querySelector('dialog:modal')) throw new Error('ANNOTATION_NATIVE_MODAL_ACTIVE')
      defaultScreenshot = options.defaultScreenshot === undefined ? document.getElementById('pi-ss-each').classList.contains('active') : options.defaultScreenshot === true
      state = window.__CNC_ANNOTATION_PICKER_STATE__
      panel = document.getElementById('pi-panel'); notes = document.querySelector('.pi-notes-container'); markers = document.getElementById('pi-markers')
      selecting = true; visible = true; history = [state.snapshot()]; historyIndex = 0
      dockMoved = false; dockDrag = null; colorCycle = shuffleColors()
      modalInterrupted = false
      state.setSelecting(true)
      const style = document.createElement('style'); style.textContent = css; panel.append(style)
      colorStyle = document.createElement('style'); panel.append(colorStyle)
      panel.setAttribute('role', 'toolbar'); panel.setAttribute('aria-label', 'Electron Annotate')
      const toolbar = document.createElement('div'); toolbar.className = 'pi-cnc-toolbar'
      const tools = document.createElement('div'); tools.className = 'pi-cnc-tools'
      const select = button('pi-cnc-select', 'focus-3-line', 'Select an element')
      select.addEventListener('click', () => { selecting = !selecting; state.setSelecting(selecting); if (selecting) visible = true; sync() })
      const visibility = button('pi-cnc-visibility', 'eye-line', 'Hide annotations')
      visibility.addEventListener('click', () => { visible = !visible; sync() })
      const undo = button('pi-cnc-undo', 'arrow-go-back-line', 'Undo annotation change'); undo.addEventListener('click', () => restore(-1))
      const redo = button('pi-cnc-redo', 'arrow-go-forward-line', 'Redo annotation change'); redo.addEventListener('click', () => restore(1))
      const count = document.createElement('span'); count.className = 'pi-cnc-count'; count.append(svg('chat-3-line'), document.getElementById('pi-count'))
      const close = document.getElementById('pi-close'); icon(close, 'close', 'Cancel annotation')
      tools.append(select, visibility, undo, redo, count, close)
      const send = document.getElementById('pi-submit'); icon(send, 'arrow-up-line', 'Send annotations')
      toolbar.append(tools, send); panel.append(toolbar)
      tools.title = 'Drag the dock by its edges or corners'
      panel.addEventListener('pointermove', onDockMove, true)
      panel.addEventListener('pointerup', onDockUp, true)
      panel.addEventListener('pointercancel', onDockUp, true)
      panel.addEventListener('lostpointercapture', endDockDrag)
      const message = document.createElement('span'); message.className = 'pi-cnc-status'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); panel.append(message)
      document.getElementById('pi-mode-multi').click()
      // Keep the original overlay nodes and listeners, but render them in the
      // browser's top layer so application dialogs cannot cover the picker.
      layers = [markers, document.getElementById('pi-highlight'), document.getElementById('pi-tooltip'), notes, panel]
      for (const node of layers) { node.popover = 'manual'; node.showPopover() }
      // Native modals make unrelated DOM inert. End the picker rather than
      // moving its controls into product event paths or changing app modality.
      modalObserver = new MutationObserver(onModalChange)
      modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
      observer = new MutationObserver(() => { sync(); fitCards() })
      resizeObserver = new ResizeObserver(fitCards)
      observer.observe(notes, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'title'] })
      observer.observe(markers, { childList: true })
      panel.addEventListener('click', onClick); notes.addEventListener('click', onClick); notes.addEventListener('input', onInput)
      markers.addEventListener('click', onMarker, true)
      window.addEventListener('resize', onResize)
      sync()
    },
    stop() {
      modalObserver?.disconnect(); modalObserver = null
      endDockDrag()
      for (const node of layers.toReversed()) {
        if (node.matches(':popover-open')) node.hidePopover()
        node.removeAttribute('popover')
      }
      layers = []
      panel?.removeEventListener('pointermove', onDockMove, true)
      panel?.removeEventListener('pointerup', onDockUp, true)
      panel?.removeEventListener('pointercancel', onDockUp, true)
      panel?.removeEventListener('lostpointercapture', endDockDrag)
      observer?.disconnect(); resizeObserver?.disconnect()
      panel?.removeEventListener('click', onClick); notes?.removeEventListener('click', onClick); notes?.removeEventListener('input', onInput)
      markers?.removeEventListener('click', onMarker, true)
      window.removeEventListener('resize', onResize)
      history = []; historyIndex = 0; panel = notes = markers = state = observer = resizeObserver = colorStyle = null
    },
  }
}

module.exports = { installPresentation }
