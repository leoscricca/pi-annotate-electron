// Exact approved synthetic DOM states. This code stays in developer world 1004.
(() => {
  if (window.__CNC_ANNOTATION_POLICY__) return
  const catalog = window.__CNC_ANNOTATION_STATE_CATALOG__
  const states = new Set(catalog?.states ?? [])
  const controls = new Set(catalog?.controls ?? [])
  const contentAttributes = ['role', 'aria-label', 'alt', 'title', 'type', 'placeholder', 'src', 'srcset', 'href', 'poster', 'viewBox', 'd', 'points', 'xlink:href']
  const refuse = () => { throw new Error('ANNOTATION_UNKNOWN_CONTENT') }
  const home = window.__CNC_ANNOTATION_POLICY_CONTEXT__?.home
  if (typeof home !== 'string' || !home.startsWith('/') || !home.endsWith('/home')) refuse()
  const normalizePath = text => text.replaceAll(home, 'synthetic:/home')
  const normalize = text => normalizePath(text).replace(/\s+/g, ' ').trim()
  // Exact non-content overlays from the reviewed dark/light hover and pressed tokens.
  // URLs, additional layers, pseudo-elements and other gradients never qualify.
  const controlPaints = new Map([
    ['dark', [
      'linear-gradient(rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.06))',
      'linear-gradient(rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1))',
    ]],
    ['light', [
      'linear-gradient(rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.04))',
      'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
    ]],
  ])
  const paintPseudos = [null, '::before', '::after', '::marker', '::first-letter', '::first-line', '::backdrop',
    '::selection', '::placeholder', '::file-selector-button', '::details-content', '::-webkit-scrollbar',
    '::-webkit-scrollbar-thumb', '::-webkit-scrollbar-track', '::-webkit-scrollbar-track-piece',
    '::-webkit-scrollbar-corner', '::-webkit-scrollbar-button', '::-webkit-resizer']
  const imageProperties = ['backgroundImage', 'content', 'maskImage', 'borderImageSource', 'listStyleImage',
    'webkitMaskBoxImageSource', 'shapeOutside', 'webkitBoxReflect']
  const resourceProperties = ['filter', 'backdropFilter', 'clipPath', 'cursor', 'fill', 'stroke', 'offsetPath']
  const hasPaint = value => value && !['none', 'normal', '""'].includes(value)
  function paintValues(style) {
    return [...imageProperties.filter(name => hasPaint(style[name])),
      ...resourceProperties.filter(name => /\burl\s*\(/i.test(style[name] || ''))]
      .map(name => [name, style[name]])
  }
  let approved = null
  function assertPlainPaint(node) {
    for (const pseudo of paintPseudos) {
      const style = getComputedStyle(node, pseudo)
      if (paintValues(style).length || ['filter', 'backdropFilter', 'clipPath'].some(name => hasPaint(style[name]))) refuse()
    }
  }
  function serialize(ignore = () => false) {
    const badge = document.getElementById('cnc-annotation-synthetic')
    if (!badge || badge.tagName !== 'DIV' || badge.childNodes.length !== 1 || badge.firstChild.nodeType !== Node.TEXT_NODE
      || badge.textContent !== 'Synthetic annotation workspace') refuse()
    assertPlainPaint(badge)
    let count = 0
    function assertPlainLayer(node) {
      if (++count > 25000 || !node.matches('div,span') || contentAttributes.some(name => node.hasAttribute(name))) refuse()
      assertPlainPaint(node)
      for (const child of node.children) assertPlainLayer(child)
    }
    function describe(node) {
      if (++count > 25000) refuse()
      if (node.nodeType === Node.TEXT_NODE) return normalize(node.textContent)
      if (!(node instanceof Element)) return null
      if (node === badge || ignore(node)) return null
      if (node.matches('canvas,iframe,object,embed,video,audio') && node.getClientRects().length) refuse()
      if (node.matches('.cm-cursorLayer,.cm-selectionLayer')) {
        if (normalize(node.textContent)) refuse()
        assertPlainLayer(node)
        return null
      }
      const styles = paintPseudos.map(pseudo => getComputedStyle(node, pseudo))
      const knownControl = node.matches('button:hover,button:active')
        && controls.has(normalize(node.getAttribute('aria-label') || node.textContent || ''))
      const paintState = node.matches(':active') ? 1 : 0
      const expectedPaint = knownControl
        ? controlPaints.get(document.body.dataset.previewColorScheme)?.[paintState] : undefined
      const pixels = styles.slice(0, 3).map((style, index) => [
        index === 0 && style.backgroundImage === expectedPaint ? 'none' : style.backgroundImage,
        style.content,
      ]).filter(pair => pair.some(hasPaint))
      // Preserve the existing catalog representation when no additional media exists.
      // Every additional image source keeps its property and pseudo identity.
      styles.forEach((style, index) => {
        for (const [property, value] of paintValues(style)) {
          if (index < 3 && ['backgroundImage', 'content'].includes(property)) continue
          pixels.push([paintPseudos[index] || 'element', property,
            normalizePath(value).replaceAll(new URL('.', document.baseURI).href, 'app:/')])
        }
      })
      const attributes = contentAttributes.filter(name => node.hasAttribute(name)).map(name => [name, normalizePath(node.getAttribute(name)).replaceAll(new URL('.', document.baseURI).href, 'app:/')])
      return [node.tagName.toLowerCase(), attributes, pixels, [...node.childNodes].map(describe).filter(value => value !== null && value !== '')]
    }
    const body = describe(document.body)
    const rootPaint = paintPseudos.flatMap(pseudo => paintValues(getComputedStyle(document.documentElement, pseudo))
      .map(([property, value]) => [pseudo || 'element', property,
        normalizePath(value).replaceAll(new URL('.', document.baseURI).href, 'app:/')]))
    const value = JSON.stringify(rootPaint.length ? [body, rootPaint] : body)
    if (value.length > 1024 * 1024) refuse()
    return value
  }
  async function digest(value) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
  }
  Object.defineProperty(window, '__CNC_ANNOTATION_POLICY__', { value: Object.freeze({
    async fingerprint(ignore) { const value = serialize(ignore), hash = await digest(value); if (value !== serialize(ignore)) refuse(); return hash },
    async assert(ignore) {
      const value = serialize(ignore), hash = await digest(value)
      if (!states.has(hash) || value !== serialize(ignore)) refuse()
      approved = value
    },
    selection(element, ignore) {
      const name = normalize(element.getAttribute('aria-label') || element.textContent || '')
      if (!controls.has(name) || approved !== serialize(ignore)) refuse()
      return name
    },
  }), configurable: false, writable: false })
})()
