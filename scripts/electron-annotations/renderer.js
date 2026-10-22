// This script executes only in developer world 1004, never in the app world.
(() => {
  if (window.__CNC_ANNOTATION_CONTROL__) return
  const bridge = window.__CNC_ELECTRON_ANNOTATION__
  const listeners = []
  let current = null
  const overlayRoots = new Set()
  const badge = document.getElementById('cnc-annotation-synthetic')
  const own = node => {
    let element = node instanceof Element ? node : node?.parentElement
    while (element) {
      if (element === badge || overlayRoots.has(element)) return true
      element = element.parentElement
    }
    return false
  }
  const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
  const fail = code => { throw new Error(code) }
  const viewport = () => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollX, scrollY })
  async function privacy() {
    if (document.getElementById('cnc-annotation-synthetic')?.textContent !== 'Synthetic annotation workspace'
      || !document.getElementById('composer-model')) fail('ANNOTATION_PROVENANCE_REFUSED')
    if ([...document.querySelectorAll('.codex-device-challenge, input[type=password], [autocomplete=one-time-code]')].some(visible)) fail('ANNOTATION_SENSITIVE_CONTENT')
    for (const element of document.querySelectorAll('input, textarea, [contenteditable]')) {
      if (own(element) || !visible(element) || element.matches('input[type=checkbox],input[type=radio]')) continue
      const value = element.isContentEditable ? element.textContent : element.value
      if (value?.trim() && !(element.isContentEditable && element.matches('.cm-content[role=textbox][contenteditable]') && value.trim() === 'Synthetic annotation draft')) fail('ANNOTATION_EDITABLE_CONTENT')
    }
    if (!window.__CNC_ANNOTATION_POLICY__) fail('ANNOTATION_POLICY_UNAVAILABLE')
    await window.__CNC_ANNOTATION_POLICY__.assert(own)
  }
  function mutations(records) {
    if (!current) return
    for (const record of records) {
      if (own(record.target)) continue
      if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node instanceof Element && own(node))) continue
      if (record.type === 'attributes' && ['aria-hidden', 'inert'].includes(record.attributeName)) {
        const original = current.before.attributes.get(record.target)
        const expected = original && (record.attributeName === 'inert' ? original.inert : original.hidden)
        if (original && record.target.getAttribute(record.attributeName) === expected) continue
      }
      if (record.type === 'attributes' && record.target === document.body && record.attributeName === 'style') {
        const properties = new Set([...current.before.bodyStyle.keys(), ...current.activeBodyStyle.keys(), ...document.body.style])
        const unchanged = [...properties].every(name => name === 'cursor' || document.body.style.getPropertyValue(name) === (current.before.bodyStyle.get(name) || '')
          || document.body.style.getPropertyValue(name) === (current.activeBodyStyle.get(name) || ''))
        if (unchanged) continue
      }
      if (record.type === 'attributes' && ['data-focus-visible', 'data-focused'].includes(record.attributeName)) continue
      current.revision += 1
    }
  }
  async function gate() {
    const request = current
    if (!request) fail('ANNOTATION_REQUEST_REVOKED')
    mutations(request.observer.takeRecords())
    await privacy()
    if (current !== request || request.stopping) fail('ANNOTATION_REQUEST_REVOKED')
    mutations(request.observer.takeRecords())
    if (current.revision !== 0) fail('ANNOTATION_CONTENT_CHANGED')
    for (const [selector, element] of current.bindings) {
      if (!element.isConnected || document.querySelector(selector) !== element) fail('ANNOTATION_TARGET_CHANGED')
      const before = current.captureBounds.get(selector)
      const rect = element.getBoundingClientRect()
      if (before && ['x', 'y', 'width', 'height'].some(key => rect[key] !== before[key])) fail('ANNOTATION_STALE_GEOMETRY')
    }
    return { request: current.request, generation: current.generation, revision: current.revision, viewport: viewport(), mode: current.captureMode || current.mode }
  }
  function remember() {
    const attributes = new Map([...document.querySelectorAll('*')].map(element => [element,
      { hidden: element.getAttribute('aria-hidden'), inert: element.getAttribute('inert') }]))
    const selection = getSelection(), ranges = []
    for (let i = 0; selection && i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i).cloneRange())
    return { attributes, bodyStyle: new Map([...document.body.style].map(name => [name, document.body.style.getPropertyValue(name)])),
      focus: document.activeElement, ranges, cursor: document.body.style.cursor, x: scrollX, y: scrollY }
  }
  function restore() {
    if (!current) return
    const before = current.before
    current.observer.disconnect()
    document.removeEventListener('mousemove', blockProductMouseMove, true)
    bridge.guard(false)
    let changedOutsideOverlay = false
    if ([before.cursor, '', 'crosshair', 'default'].includes(document.body.style.cursor)) document.body.style.cursor = before.cursor
    else changedOutsideOverlay = true
    for (const [element, values] of before.attributes) {
      if (!element.isConnected) continue
      if (element.getAttribute('aria-hidden') !== values.hidden || element.getAttribute('inert') !== values.inert) changedOutsideOverlay = true
    }
    if (before.focus?.isConnected) before.focus.focus({ preventScroll: true })
    const selection = getSelection()
    if (selection) {
      selection.removeAllRanges()
      for (const range of before.ranges) if (range.startContainer.isConnected && range.endContainer.isConnected) selection.addRange(range)
    }
    window.scrollTo(before.x, before.y)
    current = null
    if (changedOutsideOverlay) fail('ANNOTATION_APP_STATE_CHANGED')
  }
  async function cancelLocally() {
    if (!current) return { restored: true }
    const request = current
    request.stopping = true
    window.__CNC_ANNOTATION_PRESENTATION__?.stop()
    for (const listener of listeners) listener({ type: 'CANCEL' }, {}, () => {})
    if (request.submission) await request.submission.done
    restore()
    if (document.getElementById('pi-panel')) fail('ANNOTATION_RESTORE_UNCONFIRMED')
    return { restored: true }
  }
  function selectionElement(selector) {
    if (typeof selector !== 'string' || selector.length > 2048) fail('ANNOTATION_SELECTION_REFUSED')
    let elements
    try { elements = document.querySelectorAll(selector) } catch { fail('ANNOTATION_SELECTION_REFUSED') }
    if (elements.length !== 1) fail('ANNOTATION_SELECTION_REFUSED')
    const element = elements[0]
    if (!element.matches('button') || own(element) || !visible(element) || element.querySelector('input,textarea,[contenteditable]')
      || element.hasAttribute('role') && element.getAttribute('role') !== 'button') fail('ANNOTATION_UNKNOWN_REGION')
    window.__CNC_ANNOTATION_POLICY__.selection(element, own)
    return element
  }
  function metadataSelector(element) {
    const parts = []
    for (let node = element; node !== document.body; node = node.parentElement) {
      if (!node?.parentElement || parts.length >= 64) fail('ANNOTATION_SELECTION_REFUSED')
      const siblings = [...node.parentElement.children].filter(sibling => sibling.tagName === node.tagName)
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`)
    }
    const selector = 'body > ' + parts.join(' > ')
    if (selector.length > 2048) fail('ANNOTATION_SELECTION_REFUSED')
    return selector
  }
  function inspectSelection(raw, index) {
    if (!raw) fail('ANNOTATION_SELECTION_REFUSED')
    const element = selectionElement(raw.selector)
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
    const bounds = { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }
    if (Object.entries(bounds).some(([key, value]) => !raw.rect || Math.abs(Math.round(value) - raw.rect[key]) > 0)) fail('ANNOTATION_STALE_GEOMETRY')
    current.bindings.set(raw.selector, element)
    return { selector: metadataSelector(element), image: current.imageChoices?.get(index) === true, tag: 'button', role: 'button',
      name: window.__CNC_ANNOTATION_POLICY__.selection(element, own), comment: raw.comment,
      bounds, styles: { display: style.display, fontSize: style.fontSize, paddingTop: style.paddingTop, paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom, paddingLeft: style.paddingLeft } }
  }
  function restrictControls() {
    for (const id of ['pi-ss-full', 'pi-debug-mode', 'pi-etch-mode']) {
      const element = document.getElementById(id)
      if (!element) fail('ANNOTATION_PICKER_INCOMPATIBLE')
      element.disabled = true
      const control = element.closest('label') || element
      control.hidden = true
      control.style.display = 'none'
    }
  }
  document.addEventListener('click', event => {
    if (!current || !(event.target instanceof Element)) return
    if (!own(event.target)) {
      try {
        const button = event.target.closest('button')
        if (!button) fail('ANNOTATION_UNKNOWN_REGION')
        window.__CNC_ANNOTATION_POLICY__.selection(button, own)
      } catch {
        event.preventDefault(); event.stopImmediatePropagation()
        void bridge.invoke({ kind: 'cancel', request: current.request, generation: current.generation }).catch(() => {})
        return
      }
    }
    if (event.target.closest('#pi-ss-none')) current.mode = 'none'
    if (event.target.closest('#pi-ss-each')) current.mode = 'crop'
    if (event.target.closest('#pi-submit')) {
      if (current.submission) { event.preventDefault(); event.stopImmediatePropagation(); return }
      let resolve
      const done = new Promise(yes => { resolve = yes })
      current.submission = { done, resolve }
    }
  }, true)
  function blockProductMouseMove(event) {
    if (current && !own(event.target)) {
      window.__CNC_ANNOTATION_PICKER_STATE__?.moveDrag({ x: event.clientX, y: event.clientY })
      event.stopPropagation()
    }
  }
  // Missing controls cannot establish image intent and therefore cause refusal.
  function imageChoices() {
    const badges = document.querySelectorAll('.pi-marker-badge')
    const cards = [...document.querySelectorAll('.pi-note-card')].sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
    if (!badges.length || cards.length !== badges.length) fail('ANNOTATION_IMAGE_INTENT_REFUSED')
    const choices = new Map()
    cards.forEach((card, index) => {
      if (Number(card.dataset.index) !== index) fail('ANNOTATION_IMAGE_INTENT_REFUSED')
      const selector = card.querySelector('.pi-note-selector')?.title
      const element = selectionElement(selector)
      current.bindings.set(selector, element)
      const rect = element.getBoundingClientRect()
      current.captureBounds.set(selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
      choices.set(index, card.querySelector('.pi-note-screenshot')?.classList.contains('active') === true)
    })
    current.imageChoices = choices
    if (![...choices.values()].some(Boolean)) current.captureMode = 'none'
  }
  window.chrome = { runtime: { id: 'cnc-electron-annotation', onMessage: { addListener: callback => listeners.push(callback) },
    sendMessage: async message => {
      const authority = current && { request: current.request, generation: current.generation }
      if (message.type === 'ANNOTATIONS_COMPLETE') current?.submission?.resolve()
      if (message.requestId && message.requestId !== current?.request) return { error: 'ANNOTATION_STALE_RESULT' }
      try {
      if (!current) fail('ANNOTATION_REQUEST_REVOKED')
      if (message.type === 'CANCEL') {
        if (current.stopping) return { accepted: true }
        const packet = { kind: 'cancel', request: current.request, generation: current.generation }
        return await bridge.invoke(packet)
      }
      if (current.stopping) return { error: 'ANNOTATION_REQUEST_REVOKED' }
      if (message.type === 'CAPTURE_SCREENSHOT') {
        imageChoices()
        if (current.captureMode === 'none') return {}
        return await bridge.invoke({ kind: 'capture', ...await gate() })
      }
      if (message.type !== 'ANNOTATIONS_COMPLETE' || message.requestId !== current.request) fail('ANNOTATION_PACKET_REFUSED')
      const result = message.result
      if (!result || result.success !== true || result.editCapture || result.screenshot || result.prompt) fail('ANNOTATION_PACKET_REFUSED')
      const state = await gate()
      if (!Array.isArray(result.elements) || result.elements.length < 1 || result.elements.length > 10) fail('ANNOTATION_SELECTION_REFUSED')
      const selections = result.elements.map(inspectSelection)
      current.submitted = true
      const packet = { kind: 'complete', ...state, selections, images: result.screenshots }
      return await bridge.invoke(packet)
      } catch {
        if (authority) void bridge.invoke({ kind: 'cancel', ...authority }).catch(() => {})
        return { error: 'ANNOTATION_REFUSED' }
      }
    } } }
  bridge.onSelect(() => {
    if (!current || current.stopping || !(document.activeElement instanceof Element) || own(document.activeElement)) return
    const element = document.activeElement
    if (!element.matches('button') || !visible(element)) return
    try {
      window.__CNC_ANNOTATION_POLICY__.selection(element, own)
      const rect = element.getBoundingClientRect()
      element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }))
      element.click()
    } catch {
      void bridge.invoke({ kind: 'cancel', request: current.request, generation: current.generation }).catch(() => {})
    }
  })
  bridge.onEscape(() => {
    if (!current) return
    void bridge.invoke({ kind: 'cancel', request: current.request, generation: current.generation }).catch(() => {})
  })
  window.__CNC_ANNOTATION_CONTROL__ = {
    async start(configuration) {
      if (current || document.querySelector('[id^="pi-"], [class^="pi-"], [class*=" pi-"]')) fail('ANNOTATION_TARGET_BUSY')
      overlayRoots.clear()
      await privacy()
      if (current || document.querySelector('[id^="pi-"], [class^="pi-"], [class*=" pi-"]')) fail('ANNOTATION_TARGET_BUSY')
      const before = remember()
      current = { ...configuration, before, revision: 0, bindings: new Map(), captureBounds: new Map(), submitted: false, stopping: false,
        observer: new MutationObserver(mutations) }
      bridge.guard(true)
      {
        for (const listener of listeners) listener({ type: 'START_ANNOTATION', requestId: configuration.request }, {}, () => {})
        document.addEventListener('mousemove', blockProductMouseMove, true)
        for (const element of document.querySelectorAll('[id^="pi-"], .pi-notes-container, svg.pi-connectors')) overlayRoots.add(element)
        restrictControls()
        document.getElementById(configuration.mode === 'crop' ? 'pi-ss-each' : 'pi-ss-none').click()
        window.__CNC_ANNOTATION_PRESENTATION__.start({ defaultScreenshot: configuration.mode === 'crop' })
        current.activeBodyStyle = new Map([...document.body.style].map(name => [name, document.body.style.getPropertyValue(name)]))
        current.observer.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true })
        return { active: true }
      }
    },
    gate,
    async verify() {
      const request = current
      await privacy()
      if (!request || current !== request || request.stopping) fail('ANNOTATION_REQUEST_REVOKED')
      mutations(current.observer.takeRecords())
      for (const [selector, element] of current.bindings) if (!element.isConnected || document.querySelector(selector) !== element) fail('ANNOTATION_TARGET_CHANGED')
      return { revision: current.revision, viewport: viewport() }
    },
    stop: cancelLocally,
  }
})()
