const fs = require('node:fs/promises')
const path = require('node:path')

// A presentation adapter around the unchanged, integrity-checked Pi Annotate picker.
// Icons are the application's licensed Remix assets; see design/openchamber/LICENSE.remix-icon.txt.
function installPresentation(css, icons) {
  let observer
  let resizeObserver
  let panel
  let notes
  let feedbackId = 0
  const decorated = new WeakSet()
  const icon = (node, name, label) => {
    node.innerHTML = icons[name]
    node.setAttribute('aria-label', label)
    node.title = label
    node.querySelector('svg').setAttribute('aria-hidden', 'true')
  }
  function fitCards() {
    const bottom = panel.getBoundingClientRect().top - 8
    for (const card of notes.querySelectorAll('.pi-note-card')) {
      if (card.classList.contains('dragging')) continue
      const box = card.getBoundingClientRect()
      card.style.left = `${Math.max(8, Math.min(box.x, innerWidth - box.width - 8))}px`
      card.style.top = `${Math.max(8, Math.min(box.y, bottom - box.height))}px`
    }
  }
  function sync() {
    const crop = document.getElementById('pi-ss-each').classList.contains('active')
    for (const card of notes.querySelectorAll('.pi-note-card')) {
      const selector = card.querySelector('.pi-note-selector')
      const element = document.querySelector(selector.title)
      const name = element ? element.getAttribute('aria-label') || element.innerText || element.tagName.toLowerCase() : selector.textContent
      if (selector.textContent !== name.slice(0, 128)) selector.textContent = name.slice(0, 128)
      if (!decorated.has(card)) {
        decorated.add(card)
        const text = card.querySelector('.pi-note-textarea')
        text.setAttribute('aria-label', 'Feedback')
        text.placeholder = 'Describe the change for this element…'
        const label = document.createElement('label')
        label.className = 'pi-cnc-feedback-label'
        text.id = `pi-feedback-${++feedbackId}`
        label.htmlFor = text.id
        label.textContent = 'Feedback'
        text.before(label)
        for (const [selector, name, description] of [
          ['.pi-note-close', 'close', 'Remove element'],
          ['.pi-note-expand', 'arrow-down-s', 'Expand to parent'],
          ['.pi-note-contract', 'arrow-down-s', 'Contract to child'],
          ['.pi-note-screenshot', 'fullscreen', 'Include element crop'],
        ]) icon(card.querySelector(selector), name, description)
        const row = document.createElement('label')
        row.className = 'pi-cnc-capture'
        row.append('Screenshot')
        const select = document.createElement('select')
        select.setAttribute('aria-label', 'Screenshot')
        select.add(new Option('None', 'none'))
        select.add(new Option('Element crop', 'crop'))
        select.addEventListener('change', () => {
          document.getElementById(select.value === 'crop' ? 'pi-ss-each' : 'pi-ss-none').click()
        })
        row.append(select)
        card.append(row)
        const hint = document.createElement('div')
        hint.className = 'pi-cnc-review'
        hint.textContent = 'To the current Pi session · review only'
        card.append(hint)
        resizeObserver.observe(card)
      }
      const select = card.querySelector('select')
      if (select.value !== (crop ? 'crop' : 'none')) select.value = crop ? 'crop' : 'none'
      const screenshot = card.querySelector('.pi-note-screenshot')
      screenshot.disabled = !crop
      const pressed = String(crop && screenshot.classList.contains('active'))
      if (screenshot.getAttribute('aria-pressed') !== pressed) screenshot.setAttribute('aria-pressed', pressed)
    }
    document.getElementById('pi-submit').disabled = !document.querySelector('.pi-marker-badge')
    for (const id of ['pi-mode-single', 'pi-mode-multi']) {
      const button = document.getElementById(id)
      button.setAttribute('aria-pressed', String(button.classList.contains('active')))
    }
  }
  function onClick(event) {
    if (event.target.closest('#pi-ss-each, #pi-ss-none, #pi-mode-single, #pi-mode-multi')) sync()
  }
  window.__CNC_ANNOTATION_PRESENTATION__ = {
    start() {
      panel = document.getElementById('pi-panel')
      notes = document.querySelector('.pi-notes-container')
      const style = document.createElement('style')
      style.textContent = css
      panel.append(style)
      panel.setAttribute('role', 'toolbar')
      panel.setAttribute('aria-label', 'Electron Annotate')
      const toolbar = document.createElement('div')
      toolbar.className = 'pi-cnc-toolbar'
      const brand = document.createElement('span')
      brand.className = 'pi-cnc-brand'
      brand.innerHTML = icons['pencil-ai']
      brand.querySelector('svg').setAttribute('aria-hidden', 'true')
      brand.append('Electron Annotate')
      toolbar.append(brand)
      for (const [id, name, label] of [
        ['pi-mode-single', 'search', 'Select one element'],
        ['pi-mode-multi', 'list-indefinite', 'Select multiple elements'],
      ]) {
        const button = document.getElementById(id)
        icon(button, name, label)
        toolbar.append(button)
      }
      toolbar.append(document.getElementById('pi-count'))
      const send = document.getElementById('pi-submit')
      icon(send, 'send-plane-2', 'Send')
      send.append('Send')
      toolbar.append(send)
      const close = document.getElementById('pi-close')
      icon(close, 'close', 'Cancel annotation')
      toolbar.append(close)
      panel.append(toolbar)
      panel.addEventListener('click', onClick)
      observer = new MutationObserver(() => { sync(); fitCards() })
      resizeObserver = new ResizeObserver(fitCards)
      // Watch structure and screenshot state, not presentation attributes written by sync.
      observer.observe(notes, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      window.addEventListener('resize', fitCards)
      sync()
    },
    stop() {
      observer?.disconnect()
      resizeObserver?.disconnect()
      panel?.removeEventListener('click', onClick)
      window.removeEventListener('resize', fitCards)
      observer = null
      panel = null
      notes = null
    },
  }
}

function scopedTokens(source) {
  const rules = [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  if (rules.length !== 3 || rules[0][1].trim() !== ':root' || rules[1][1].trim() !== ':root, [data-theme="dark"]'
    || rules[2][1].trim() !== '[data-theme="light"]') throw new Error('ANNOTATION_TOKEN_SOURCE_REFUSED')
  const owned = ':is(#pi-panel,.pi-note-card,#pi-highlight,#pi-tooltip,#pi-markers,.pi-connectors)'
  const dark = `[data-theme="dark"] ${owned},[data-preview-color-scheme="dark"] ${owned}`
  const light = `[data-theme="light"] ${owned},[data-preview-color-scheme="light"] ${owned}`
  return `${owned}{${rules[0][2]}${rules[1][2]}}\n@media(prefers-color-scheme:light){${owned}{${rules[2][2]}}}\n${dark}{${rules[1][2]}}\n${light}{${rules[2][2]}}`
}

async function presentationSource(repositoryRoot) {
  const tokenSource = await fs.readFile(path.join(repositoryRoot, 'design/openchamber/tokens.css'), 'utf8')
  const css = scopedTokens(tokenSource) + await fs.readFile(path.join(repositoryRoot, 'scripts/electron-annotations/presentation.css'), 'utf8')
  const names = ['pencil-ai', 'search', 'list-indefinite', 'send-plane-2', 'close', 'arrow-down-s', 'fullscreen']
  const assets = path.join(repositoryRoot, 'design/icons')
  const values = await Promise.all(names.map(name => fs.readFile(path.join(assets, `${name}.svg`), 'utf8')))
  return `(${installPresentation.toString()})(${JSON.stringify(css)},${JSON.stringify(Object.fromEntries(names.map((name, index) => [name, values[index]])))})`
}
module.exports = { presentationSource }
