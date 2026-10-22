// This fixed function runs in the private, Node-disabled frontend world.
// All values are literal arguments. The model supplies no JavaScript or selector.
function installPage(limits, connection) {
  if (window.__CNC_DEV_UI_PAGE__) throw new Error('DEV_UI_PAGE_ALREADY_OWNED')
  let revision = 0
  let truncated = false
  const refs = new Map()
  const stale = Symbol('stale reference')
  function text(value, max = 4096) {
    const result = String(value ?? '')
    if (result.length > max) truncated = true
    return result.slice(0, max)
  }
  function directText(node) {
    let value = ''
    for (let index = 0; index < node.childNodes.length; index += 1) {
      if (index >= 32 || value.length >= 4096) { truncated = true; break }
      const child = node.childNodes[index]
      if (child.nodeType === Node.TEXT_NODE) value += text(child.textContent)
    }
    return text(value)
  }
  function role(node) {
    const explicit = node.getAttribute('role')
    if (explicit) return text(explicit, 64)
    const tag = node.tagName.toLowerCase()
    if (tag === 'button') return 'button'
    if (tag === 'a' && node.hasAttribute('href')) return 'link'
    if (tag === 'textarea' || node.isContentEditable) return 'textbox'
    if (tag === 'input') return ({ checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button', range: 'slider' })[node.type] ?? 'textbox'
    if (tag === 'select') return 'combobox'
    if (tag === 'option') return 'option'
    if (/^h[1-6]$/.test(tag)) return 'heading'
    return ''
  }
  function name(node) {
    if (node.hasAttribute('aria-label')) return text(node.getAttribute('aria-label'))
    const ids = node.getAttribute('aria-labelledby')?.trim().split(/\s+/, 33) ?? []
    if (ids.length > 32) truncated = true
    const labelled = ids.slice(0, 32).map(id => text(document.getElementById(id)?.textContent)).join(' ').trim()
    if (labelled) return text(labelled)
    if (node.labels?.length) return text(Array.from(node.labels).map(label => text(label.textContent)).join(' ').trim())
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable) {
      return text(node.getAttribute('placeholder') ?? node.getAttribute('aria-placeholder') ?? '')
    }
    if (['button', 'link', 'heading', 'option'].includes(role(node))) return text(node.innerText ?? node.textContent).trim()
    return directText(node).trim()
  }
  function signature(node) { return JSON.stringify([node.tagName, role(node), name(node), node.getAttribute('type'), node.getAttribute('href')]) }
  function value(node) {
    if (['checkbox', 'radio', 'switch'].includes(role(node))) return text(node.getAttribute('aria-checked') ?? String(node.checked))
    if (node.hasAttribute('aria-pressed')) return text(node.getAttribute('aria-pressed'))
    if ('value' in node) return text(node.value)
    if (node.isContentEditable) return text(node.innerText)
    return undefined
  }
  function rect(node) {
    const r = node.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }
  function visible(node) {
    const style = getComputedStyle(node)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && node.getClientRects().length > 0
  }
  function locate(params) {
    const entry = refs.get(params.ref)
    if (params.revision !== revision || !entry || !entry.node.isConnected || !visible(entry.node) || signature(entry.node) !== entry.signature) throw stale
    return entry.node
  }
  function viewport() { return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollX, scrollY } }
  function snapshot() {
    refs.clear(); revision += 1; truncated = false
    const nodes = []
    let bytes = 0
    let visited = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    let node = walker.currentNode
    while (node) {
      if (++visited > 10000 || nodes.length >= limits.nodes) { truncated = true; break }
      if (visible(node)) {
        let depth = 0
        for (let parent = node; parent && parent !== document.body; parent = parent.parentElement) depth += 1
        const box = rect(node)
        if (depth <= 128 && box.width <= 8192 && box.height <= 8192 && Math.abs(box.x) <= 1000000 && Math.abs(box.y) <= 1000000) {
          const ref = `${connection}.e${nodes.length + 1}`
          const item = { ref, depth, tag: text(node.tagName.toLowerCase(), 64), role: role(node), name: name(node), rect: box,
            disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true', focused: node === document.activeElement }
          const input = value(node)
          if (input !== undefined) item.value = input
          bytes += new TextEncoder().encode(JSON.stringify(item)).length
          if (bytes > limits.bytes) { truncated = true; break }
          nodes.push(item); refs.set(ref, { node, signature: signature(node) })
        } else truncated = true
      }
      node = walker.nextNode()
    }
    return { revision, viewport: viewport(), nodes, truncated }
  }
  function target(params) {
    const node = locate(params)
    node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
    const box = rect(node)
    const left = Math.max(0, box.x); const top = Math.max(0, box.y)
    const right = Math.min(innerWidth, box.x + box.width); const bottom = Math.min(innerHeight, box.y + box.height)
    if (right <= left || bottom <= top) throw stale
    const x = (left + right) / 2; const y = (top + bottom) / 2
    const hit = document.elementFromPoint(x, y)
    if (!hit || (hit !== node && !node.contains(hit))) throw stale
    return { x, y }
  }
  const methods = {
    snapshot,
    target,
    focus(params) {
      const node = locate(params)
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node.isContentEditable)) throw stale
      target(params); node.focus({ preventScroll: true })
      if (document.activeElement !== node) throw stale
      return true
    },
    value(params) { return value(locate(params)) },
    geometry(params) {
      if (params.ref) return { viewport: viewport(), rect: rect(locate(params)) }
      return { viewport: viewport() }
    },
    scroll(params) {
      const node = params.ref ? locate(params) : document.scrollingElement
      const before = [node.scrollLeft, node.scrollTop]
      const delta = params.direction === 'up' || params.direction === 'left' ? -params.amount : params.amount
      node.scrollBy({ left: params.direction === 'left' || params.direction === 'right' ? delta : 0,
        top: params.direction === 'up' || params.direction === 'down' ? delta : 0, behavior: 'instant' })
      return { outcome: before[0] !== node.scrollLeft || before[1] !== node.scrollTop ? 'observed' : 'dispatched' }
    },
    close() { refs.clear(); delete window.__CNC_DEV_UI_PAGE__; return true },
  }
  Object.defineProperty(window, '__CNC_DEV_UI_PAGE__', { configurable: true, value: {
    connection,
    call(method, params, owner) {
      if (owner !== connection || !Object.hasOwn(methods, method)) return { ok: false, code: 'STALE_REFERENCE' }
      try { return { ok: true, value: methods[method](params) } }
      catch (error) { return { ok: false, code: error === stale ? 'STALE_REFERENCE' : 'OPERATION_FAILED' } }
    },
  } })
  return true
}
module.exports = { installPage }
