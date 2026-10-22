// Fixed frontend adapter for the unchanged, licensed Pi Annotate picker.
function installPicker(connection) {
  const assetKey = '__piAnnotate_cnc-attached-development'
  if (window.__CNC_DEV_PICKER__ || Object.hasOwn(window, assetKey)) throw new Error('DEV_UI_PICKER_ALREADY_OWNED')
  const bridge = window.__CNC_DEV_UI__
  if (!bridge) throw new Error('DEV_UI_PRELOAD_UNAVAILABLE')
  const listeners = []
  const handlers = new Map()
  const chromeBefore = Object.getOwnPropertyDescriptor(window, 'chrome')
  let current = null
  let lastFailure = null
  let lastSelection = null
  let selectedCount = 0
  const own = node => node instanceof Element && !!node.closest('#pi-panel, .pi-note-card, #pi-markers, #pi-highlight, #pi-tooltip')
  const viewport = () => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollX, scrollY })
  const fail = () => { throw new Error('DEV_UI_PICKER_REFUSED') }
  function selected(selector) {
    if (typeof selector !== 'string' || selector.length > 2048) fail()
    let nodes
    try { nodes = document.querySelectorAll(selector) } catch { fail() }
    if (nodes.length !== 1 || own(nodes[0]) || !nodes[0].getClientRects().length) fail()
    return nodes[0]
  }
  function identity(node) { return JSON.stringify([node.tagName, node.getAttribute('role'), node.getAttribute('aria-label'), node.getAttribute('type'), node.getAttribute('href')]) }
  function cards() {
    return [...document.querySelectorAll('.pi-note-card')].sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
  }
  function bindCards(previous = new Set()) {
    for (const card of cards()) {
      const selector = card.querySelector('.pi-note-selector')?.title
      const node = selected(selector)
      const old = current.bindings.get(selector)
      if (previous.has(selector) && old && old.node !== node) fail()
      current.bindings.set(selector, { node, identity: identity(node) })
    }
  }
  function live(selector) {
    const entry = current.bindings.get(selector)
    if (!entry || !entry.node.isConnected || selected(selector) !== entry.node || identity(entry.node) !== entry.identity) fail()
    return entry.node
  }
  function rect(node) { const value = node.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height } }
  function choices() {
    for (const badge of document.querySelectorAll('.pi-marker-badge:not(.open)')) badge.click()
    const values = cards()
    if (!values.length || values.length > 10) fail()
    const result = []
    values.forEach((card, index) => {
      if (Number(card.dataset.index) !== index) fail()
      const selector = card.querySelector('.pi-note-selector')?.title
      const node = live(selector)
      result.push({ selector, rect: rect(node), image: current.mode === 'crop' && card.querySelector('.pi-note-screenshot')?.classList.contains('active') === true })
    })
    current.choices = result
    return result
  }
  function state() {
    if (!current || current.stopping) fail()
    const values = current.final ?? current.choices ?? choices()
    for (const value of values) {
      const box = rect(live(value.selector))
      if (Object.keys(box).some(key => box[key] !== value.rect[key])) fail()
    }
    return { viewport: viewport(), selections: values.map(value => ({ selector: value.selector, rect: value.rect, image: value.image })) }
  }
  function remember() {
    const selection = getSelection(); const ranges = []
    for (let index = 0; selection && index < selection.rangeCount; index += 1) ranges.push(selection.getRangeAt(index).cloneRange())
    const focus = document.activeElement
    return { focus, ranges, cursor: document.body.style.cursor, x: scrollX, y: scrollY,
      input: focus instanceof HTMLInputElement || focus instanceof HTMLTextAreaElement
        ? { start: focus.selectionStart, end: focus.selectionEnd, direction: focus.selectionDirection } : null }
  }
  async function stop() {
    if (!current) return { restored: true }
    const request = current
    if (request.stopPromise) return request.stopPromise
    request.stopping = true
    request.stopPromise = (async () => {
      window.__CNC_ANNOTATION_PRESENTATION__?.stop()
      for (const listener of listeners) listener({ type: 'CANCEL' }, {}, () => {})
      if (request.submission) await request.submission.done
      bridge.guard(false)
      const before = request.before
      if (['', 'crosshair', 'default', before.cursor].includes(document.body.style.cursor)) document.body.style.cursor = before.cursor
      const selection = getSelection()
      if (selection) {
        selection.removeAllRanges()
        for (const range of before.ranges) if (range.startContainer.isConnected && range.endContainer.isConnected) selection.addRange(range)
      }
      if (before.focus?.isConnected) {
        before.focus.focus({ preventScroll: true })
        if (before.input && before.input.start !== null) before.focus.setSelectionRange(before.input.start, before.input.end, before.input.direction)
      }
      scrollTo(before.x, before.y)
      if (document.getElementById('pi-panel') || document.querySelector('.pi-note-card')) fail()
      if (current === request) current = null
      return { restored: true }
    })()
    return request.stopPromise
  }
  function controls() {
    for (const id of ['pi-ss-full', 'pi-debug-mode', 'pi-etch-mode']) {
      const node = document.getElementById(id)
      if (!node) fail()
      node.disabled = true
      const control = node.closest('label') ?? node
      control.hidden = true; control.style.display = 'none'
    }
    const context = document.getElementById('pi-context')
    if (context) { context.disabled = true; context.hidden = true }
  }
  const onClick = event => {
    if (!current || !(event.target instanceof Element) || !own(event.target)) return
    if (event.target.closest('#pi-ss-none')) current.mode = 'none'
    if (event.target.closest('#pi-ss-each')) current.mode = 'crop'
    if (event.target.closest('.pi-note-expand, .pi-note-contract')) {
      const request = current
      const previous = new Set(cards().map(card => card.querySelector('.pi-note-selector')?.title))
      queueMicrotask(() => { if (current === request && !request.stopping) {
        try { bindCards(previous) } catch { void bridge.post(connection, { kind: 'cancel', request: request.request }).catch(() => {}) }
      } })
    }
    if (event.target.closest('#pi-submit')) {
      if (current.submission) { event.preventDefault(); event.stopImmediatePropagation(); return }
      choices()
      let resolve
      current.submission = { done: new Promise(yes => { resolve = yes }), resolve }
    }
  }
  document.addEventListener('click', onClick, true)
  const shim = { runtime: { id: 'cnc-attached-development', onMessage: { addListener: listener => listeners.push(listener) },
    async sendMessage(message) {
      const request = current
      if (!request || message.requestId && message.requestId !== request.request) return { error: 'DEV_UI_STALE_REQUEST' }
      if (message.type === 'ANNOTATIONS_COMPLETE') request.submission?.resolve()
      if (request.stopping) return { error: 'DEV_UI_REQUEST_RETIRED' }
      try {
        if (message.type === 'CANCEL') return await bridge.post(connection, { kind: 'cancel', request: request.request })
        if (message.type === 'CAPTURE_SCREENSHOT') {
          const selected = request.choices ?? choices()
          if (request.mode === 'none' || !selected.some(value => value.image)) return {}
          return await bridge.post(connection, { kind: 'capture', request: request.request, mode: request.mode, ...state() })
        }
        if (message.type !== 'ANNOTATIONS_COMPLETE' || !message.result?.success || message.result.editCapture || message.result.prompt || message.result.screenshot) fail()
        const raw = message.result.elements
        if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10 || raw.length !== request.choices?.length) fail()
        const selections = raw.map((value, index) => {
          const node = live(value.selector); const box = rect(node)
          const expected = { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height }
          if (Object.keys(expected).some(key => Math.round(expected[key]) !== value.rect?.[key])) fail()
          if (value.selector !== request.choices[index].selector) fail()
          const name = node.getAttribute('aria-label') ?? node.getAttribute('placeholder') ?? node.innerText ?? node.tagName
          return { selector: value.selector, tag: node.tagName.toLowerCase(), name: String(name).slice(0, 4096), rect: box,
            comment: value.comment, image: request.mode === 'crop' && request.choices[index].image }
        })
        request.final = selections
        return await bridge.post(connection, { kind: 'complete', request: request.request, mode: request.mode, viewport: viewport(), selections })
      } catch {
        void bridge.post(connection, { kind: 'cancel', request: request.request }).catch(() => {})
        return { error: 'DEV_UI_ANNOTATION_REFUSED' }
      }
    } } }
  Object.defineProperty(window, 'chrome', { configurable: true, writable: true, value: shim })
  function fake(node, point = {}) { return { target: node, clientX: point.x, clientY: point.y, shiftKey: point.shiftKey === true,
    altKey: false, button: 0, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} } }
  bridge.onHover(point => {
    if (!current || current.stopping) return
    if (window.__CNC_ANNOTATION_PICKER_STATE__?.moveDrag(point)) return
    const node = document.elementFromPoint(point.x, point.y)
    if (node && !own(node)) { current.hover = point; handlers.get('mousemove')?.call(document, fake(node, point)) }
  })
  bridge.onWheel(value => {
    if (current && !current.stopping) handlers.get('wheel')?.call(document, { altKey: true, deltaY: value.deltaY,
      target: document.body, preventDefault() {}, stopPropagation() {} })
  })
  bridge.onSelect(point => {
    selectedCount += 1
    lastSelection = { point, active: !!current, stopping: current?.stopping, focus: document.activeElement?.id, stage: 'entered' }
    if (!current || current.stopping) return
    let node = point.keyboard ? document.activeElement : document.elementFromPoint(point.x, point.y)
    if (!(node instanceof Element) || own(node) || !node.getClientRects().length) { lastSelection.stage = 'initial-target-refused'; return }
    const previous = new Set(cards().map(card => card.querySelector('.pi-note-selector')?.title))
    const hidden = point.keyboard ? [...document.querySelectorAll('#pi-panel, .pi-note-card, #pi-markers')].map(element => ({ element, visibility: element.style.visibility })) : []
    try {
      for (const value of hidden) value.element.style.visibility = 'hidden'
      if (point.keyboard) {
        const box = rect(node); point = { ...point, x: box.x + box.width / 2, y: box.y + box.height / 2 }
        const hit = document.elementFromPoint(point.x, point.y)
        lastSelection.hit = hit?.tagName; lastSelection.target = node.tagName
        if (!hit || !node.contains(hit)) { lastSelection.stage = 'hit-refused'; return }
        lastSelection.pointResolved = { x: point.x, y: point.y }
        lastSelection.hitClass = typeof hit.className === 'string' ? hit.className : hit.className?.baseVal
        lastSelection.mouseHandler = String(handlers.get('mousemove')).slice(0, 180)
        lastSelection.clickHandler = String(handlers.get('click')).slice(0, 180)
        handlers.get('mousemove')?.call(document, fake(node, point))
        lastSelection.highlightBeforeWheel = document.getElementById('pi-highlight')?.style.cssText
        for (let child = hit; child && child !== node; child = child.parentElement) {
          handlers.get('wheel')?.call(document, { ...fake(node, point), altKey: true, deltaY: 1 })
        }
      } else if (!current.hover || point.x !== current.hover.x || point.y !== current.hover.y) {
        handlers.get('mousemove')?.call(document, fake(node, point))
      }
      lastSelection.highlightBeforeClick = document.getElementById('pi-highlight')?.style.cssText
      handlers.get('click')?.call(document, fake(node, point))
      lastSelection.badges = document.querySelectorAll('.pi-marker-badge').length
      lastSelection.notesRoot = !!document.getElementById('pi-notes')
      bindCards(previous)
      lastSelection.stage = 'complete'; lastSelection.count = cards().length
    } catch (error) {
      lastFailure = { stage: 'selection', name: String(error.name), message: String(error.message), stack: String(error.stack).slice(0, 2048),
        handlers: [...handlers.keys()], focused: document.activeElement?.tagName, selectors: cards().map(card => card.querySelector('.pi-note-selector')?.title) }
      void bridge.post(connection, { kind: 'cancel', request: current.request }).catch(() => {})
    }
    finally { for (const value of hidden) if (value.element.isConnected) value.element.style.visibility = value.visibility }
  })
  bridge.onEscape(() => { if (current && !current.stopping) void bridge.post(connection, { kind: 'cancel', request: current.request }).catch(() => {}) })
  Object.defineProperty(window, '__CNC_DEV_PICKER__', { configurable: true, value: {
    async call(method, params, owner) {
      if (owner !== connection) fail()
      if (method === 'start') {
        if (current || document.getElementById('pi-panel')) fail()
        current = { request: params.request, mode: params.mode, before: remember(), bindings: new Map(), choices: null, final: null, stopping: false }
        bridge.guard(true)
        const before = Object.getOwnPropertyDescriptor(document, 'addEventListener')
        const add = document.addEventListener
        document.addEventListener = function(type, callback, options) {
          if ((options === true || options?.capture === true) && ['click', 'mousemove', 'wheel', 'keydown'].includes(type) && typeof callback === 'function') handlers.set(type, callback)
          return add.call(this, type, callback, options)
        }
        try { for (const listener of listeners) listener({ type: 'START_ANNOTATION', requestId: params.request }, {}, () => {}) }
        finally { if (before) Object.defineProperty(document, 'addEventListener', before); else delete document.addEventListener }
        controls()
        document.getElementById(params.mode === 'none' ? 'pi-ss-none' : 'pi-ss-each').click()
        window.__CNC_ANNOTATION_PRESENTATION__.start({ defaultScreenshot: params.mode === 'crop' })
        if (!document.getElementById('pi-panel')) fail()
        return { active: true }
      }
      if (method === 'inspect') return { lastFailure, lastSelection, selectedCount, input: bridge.inputState(), active: current?.request, handlers: [...handlers.keys()], focus: document.activeElement?.id, count: cards().length }
      if (method === 'state') { if (params.request !== current?.request) fail(); return state() }
      if (method === 'stop') return stop()
      if (method === 'dispose') {
        await stop()
        bridge.onSelect(() => {}); bridge.onHover(() => {}); bridge.onWheel(() => {}); bridge.onEscape(() => {})
        document.removeEventListener('click', onClick, true)
        if (window.chrome !== shim || Object.hasOwn(window, assetKey) && window[assetKey] !== true) fail()
        delete window[assetKey]
        if (chromeBefore) Object.defineProperty(window, 'chrome', chromeBefore); else delete window.chrome
        delete window.__CNC_DEV_PICKER__
        delete window.__CNC_ANNOTATION_PRESENTATION__
        delete window.__CNC_ANNOTATION_PICKER_STATE__
        return { restored: true }
      }
      fail()
    },
  } })
  return true
}
module.exports = { installPicker }
