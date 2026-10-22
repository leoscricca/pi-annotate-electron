const { createHash } = require('node:crypto')

const pickerHash = 'a6833ff7e68d8b1572987079ddb82924bc9c148ff1fb9826134a4ccdce020d3d'

// Serialized inside the verified picker's lexical scope. This fixed compatibility
// hook controls annotation state only; it never dispatches product input or captures.
function installPickerState() {
  let selecting = true
  const fingerprint = element => JSON.stringify([element.tagName, ...['id', 'class', 'role', 'aria-label', 'type', 'href'].map(name => element.getAttribute(name))])
  const upstreamClick = onClick
  const upstreamHover = onMouseMove
  const upstreamPointerGuard = stopModalPointerTrap
  stopModalPointerTrap = function(event) {
    window.__CNC_ANNOTATION_PRESENTATION__?.dockPointerDown(event)
    upstreamPointerGuard(event)
  }
  onClick = function(event) {
    if (!selecting || event.target.closest('#pi-markers')) return
    const element = elementStack[stackIndex]
    if (selectedElements.length >= 10 && !selectedElements.some(value => value.element === element)) return
    upstreamClick(event)
  }
  onMouseMove = function(event) { if (selecting) upstreamHover(event) }
  Object.defineProperty(window, '__CNC_ANNOTATION_PICKER_STATE__', { configurable: true, value: Object.freeze({
    snapshot() {
      if (!isActive) throw new Error('ANNOTATION_HISTORY_RETIRED')
      return { request: requestId, entries: selectedElements.map((selection, index) => ({
        element: selection.element, selector: selection.selector, identity: fingerprint(selection.element),
        comment: elementComments.get(index) || '', screenshot: elementScreenshots.get(index) !== false,
        card: notesContainer.querySelector(`[data-index="${index}"]`),
        position: notePositions.get(index),
      })) }
    },
    restore(snapshot) {
      if (!isActive || snapshot.request !== requestId || !Array.isArray(snapshot.entries) || snapshot.entries.length > 10) throw new Error('ANNOTATION_HISTORY_RETIRED')
      const elements = new Set()
      for (const entry of snapshot.entries) {
        const element = entry.element
        const matches = document.querySelectorAll(entry.selector)
        if (!(element instanceof Element) || !element.isConnected || isPiElement(element) || !element.getClientRects().length
          || matches.length !== 1 || matches[0] !== element || fingerprint(element) !== entry.identity || elements.has(element)) throw new Error('ANNOTATION_HISTORY_STALE')
        elements.add(element)
      }
      const focus = document.activeElement
      const selection = focus instanceof HTMLTextAreaElement ? [focus.selectionStart, focus.selectionEnd, focus.selectionDirection] : null
      const retained = new Set(snapshot.entries.map(entry => entry.card))
      for (const card of notesContainer.querySelectorAll('.pi-note-card')) if (!retained.has(card)) card.remove()
      selectedElements = snapshot.entries.map(entry => createSelectionData(entry.element))
      elementComments = new Map(snapshot.entries.map((entry, index) => [index, entry.comment]))
      elementScreenshots = new Map(snapshot.entries.map((entry, index) => [index, entry.screenshot]))
      notePositions = new Map(snapshot.entries.filter(entry => entry.position).map(entry => [snapshot.entries.indexOf(entry), entry.position]))
      openNotes = new Set()
      snapshot.entries.forEach((entry, index) => {
        let card = entry.card
        if (!card) card = createNoteCard(index)
        if (!card) throw new Error('ANNOTATION_HISTORY_STALE')
        card.dataset.index = index
        card.querySelector('.pi-note-badge').textContent = index + 1
        const text = card.querySelector('.pi-note-textarea')
        if (text.value !== entry.comment) text.value = entry.comment
        card.querySelector('.pi-note-screenshot').classList.toggle('active', entry.screenshot)
        const position = notesContainer.children[index] || null
        if (position !== card) notesContainer.insertBefore(card, position)
        openNotes.add(index)
        updateNoteCardLabel(index)
      })
      updateBadges()
      updateConnectors()
      if (focus?.isConnected) {
        focus.focus({ preventScroll: true })
        if (selection) focus.setSelectionRange(...selection)
      }
    },
    setSelecting(value) {
      selecting = value === true
      if (!selecting) { elementStack = []; hideHighlight(); hideTooltip() }
    },
    moveDrag(point) {
      if (!isActive || !dragState || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
      handleDragMove({ clientX: point.x, clientY: point.y })
      return true
    },
  }) })
}

function pickerSource(source) {
  if (createHash('sha256').update(source).digest('hex') !== pickerHash) throw new Error('ANNOTATION_PICKER_CHANGED')
  const end = source.lastIndexOf('})();')
  if (end < 0 || source.slice(end + 5).trim()) throw new Error('ANNOTATION_PICKER_CHANGED')
  return source.slice(0, end) + `\n;(${installPickerState.toString()})();\n` + source.slice(end)
}

module.exports = { pickerSource }
