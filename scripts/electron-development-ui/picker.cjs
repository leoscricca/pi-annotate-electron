const fs = require('node:fs/promises')
const { createHash } = require('node:crypto')
const { AnnotationRequestLane } = require('../electron-annotations/request.cjs')
const { dimensions, cropRectangle } = require('../electron-annotations/images.cjs')
const { OperationFailure } = require('./connection.cjs')
const { decodeEvent, validateViewport } = require('./protocol.cjs')
const { captureBytes } = require('./capture.cjs')
const { installPicker } = require('./picker-page.cjs')
const { presentationSource } = require('../electron-annotations/presentation.cjs')
const { pickerSource } = require('../electron-annotations/picker-source.cjs')
const pickerHash = 'a6833ff7e68d8b1572987079ddb82924bc9c148ff1fb9826134a4ccdce020d3d'

function createPicker({ contents, binding, emit, isCurrent, onRevoked, repositoryRoot, images }) {
  let installed = false
  let prepared = false
  let activation
  let capture
  let info
  let disposePromise
  const owner = JSON.stringify(binding.connection)
  const raw = code => contents.executeJavaScriptInIsolatedWorld(1004, [{ code }])
  const world = (method, params = {}) => raw(`window.__CNC_DEV_PICKER__?.call(${JSON.stringify(method)},${JSON.stringify(params)},${owner}) ?? ({restored:true})`)
  const lane = new AnnotationRequestLane({ generation: () => isCurrent() ? binding.generation : -1, cleanup: async () => {
    if (activation) await activation.catch(() => {})
    if (!contents.isDestroyed()) {
      const result = await world('stop')
      if (result?.restored !== true) throw new Error('DEV_UI_RESTORE_UNCONFIRMED')
    }
    capture = null
  } })
  function assert(request) { if (!isCurrent()) throw new OperationFailure('STALE_TARGET', 'revoked'); return lane.assertCurrent(request) }
  async function prepare(request) {
    if (prepared) return
    const source = await fs.readFile(require.resolve('pi-annotate/chrome-extension/content.js'), 'utf8')
    assert(request)
    if (createHash('sha256').update(source).digest('hex') !== pickerHash) throw new Error('DEV_UI_PICKER_CHANGED')
    await raw(`(${installPicker.toString()})(${owner})`)
    installed = true; assert(request)
    await raw(pickerSource(source))
    assert(request)
    await raw(await presentationSource(repositoryRoot))
    assert(request); prepared = true
  }
  function packet(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DEV_UI_PICKER_PACKET_REFUSED')
    const fields = value.kind === 'cancel' ? ['kind', 'request'] : ['kind', 'request', 'mode', 'viewport', 'selections']
    if (!['capture', 'complete', 'cancel'].includes(value.kind) || Object.keys(value).sort().join(',') !== fields.sort().join(',')) throw new Error('DEV_UI_PICKER_PACKET_REFUSED')
    assert(value.request)
    if (value.kind === 'cancel') return value
    validateViewport(value.viewport)
    if (!['crop', 'none'].includes(value.mode) || !Array.isArray(value.selections) || !value.selections.length || value.selections.length > 10) throw new Error('DEV_UI_PICKER_PACKET_REFUSED')
    const notes = value.selections.map(selection => {
      const allowed = value.kind === 'capture' ? ['selector', 'rect', 'image'] : ['selector', 'tag', 'name', 'rect', 'comment', 'image']
      if (!selection || typeof selection !== 'object' || Object.keys(selection).sort().join(',') !== allowed.sort().join(',')
        || typeof selection.image !== 'boolean' || value.mode === 'none' && selection.image) throw new Error('DEV_UI_PICKER_PACKET_REFUSED')
      return { selector: selection.selector, rect: selection.rect, tag: selection.tag ?? 'div', name: selection.name ?? '', comment: selection.comment ?? 'Capture intent' }
    })
    decodeEvent(JSON.stringify({ version: 1, kind: 'annotation', binding, request: value.request, outcome: 'submitted', mode: value.mode, notes }), binding, value.request)
    return value
  }
  return {
    busy() { return lane.status().phase !== 'idle' },
    status() {
      const state = lane.status()
      let phase = 'picker-active'
      if (state.phase === 'idle') phase = 'connected-idle'
      else if (state.phase === 'blocked') phase = 'cleanup-blocked'
      return { state: phase, ...(state.request ? { operation: state.request } : {}) }
    },
    async start(request, mode) {
      if (lane.status().phase !== 'idle') throw new OperationFailure('BUSY', 'refused')
      const operation = lane.begin({ request, generation: binding.generation, timeoutMs: 300000 })
      const current = { request, mode }; info = current; capture = null
      operation.result.then(value => {
        if (isCurrent()) emit({ kind: 'annotation', request, outcome: 'submitted', mode: value.mode, notes: value.notes })
      }, () => {
        if (lane.status().phase === 'blocked') onRevoked('ANNOTATION_CLEANUP_BLOCKED')
        else if (isCurrent()) emit({ kind: 'annotation', request, outcome: 'cancelled', mode: current.mode, notes: [] })
      })
      activation = lane.work(request, async () => {
        await prepare(request); assert(request)
        const result = await world('start', { request, mode })
        assert(request)
        if (result?.active !== true) throw new Error('DEV_UI_PICKER_NOT_READY')
      })
      await activation
      return { state: 'picker-active', annotation: request, mode }
    },
    async cancel(request) {
      await lane.cancel(request)
      return { state: 'connected-idle' }
    },
    async receive(value) {
      value = packet(value)
      if (value.kind === 'cancel') { await lane.cancel(value.request); return { accepted: true } }
      info.mode = value.mode
      if (value.kind === 'capture') return lane.work(value.request, async () => {
        if (value.mode !== 'crop' || !value.selections.some(note => note.image) || capture) throw new Error('DEV_UI_CAPTURE_INTENT_REFUSED')
        const expected = { viewport: value.viewport, selections: value.selections }
        const geometry = async () => {
          const actual = await world('state', { request: value.request }); assert(value.request)
          if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('DEV_UI_STALE_GEOMETRY')
          return actual
        }
        const full = await captureBytes(contents, {}, geometry, () => isCurrent() && !lane.current?.revoked)
        assert(value.request)
        capture = { ...full, expected }
        return { dataUrl: `data:image/png;base64,${full.bytes.toString('base64')}` }
      })
      const completed = await lane.work(value.request, async () => {
        const state = await world('state', { request: value.request }); assert(value.request)
        const expected = { viewport: value.viewport, selections: value.selections.map(({ selector, rect, image }) => ({ selector, rect, image })) }
        if (JSON.stringify(state) !== JSON.stringify(expected)) throw new Error('DEV_UI_STALE_GEOMETRY')
        const requested = value.selections.filter(note => note.image)
        if (requested.length && (!capture || JSON.stringify(capture.expected) !== JSON.stringify(expected))) throw new Error('DEV_UI_CAPTURE_MISSING')
        const notes = []
        for (const selection of value.selections) {
          const { image: requestedImage, ...note } = selection
          if (requestedImage) {
            const size = dimensions(capture.bytes)
            const box = cropRectangle({ ...note.rect, x: note.rect.x + value.viewport.scrollX, y: note.rect.y + value.viewport.scrollY }, value.viewport)
            if (box.width >= size.width && box.height >= size.height) throw new Error('DEV_UI_UNCROPPED_IMAGE')
            const source = require('electron').nativeImage.createFromBuffer(capture.bytes)
            if (source.isEmpty()) throw new Error('DEV_UI_CAPTURE_MISSING')
            const bytes = source.crop(box).toPNG()
            assert(value.request)
            note.image = await images.save(bytes)
            assert(value.request)
          }
          notes.push(note)
        }
        return { mode: value.mode, notes }
      })
      await lane.complete(value.request, completed)
      return { accepted: true }
    },
    close() {
      if (!disposePromise) disposePromise = (async () => {
        await lane.invalidate()
        if (installed && !contents.isDestroyed()) {
          const result = await world('dispose')
          if (result?.restored !== true) throw new Error('DEV_UI_RESTORE_UNCONFIRMED')
        }
      })()
      return disposePromise
    },
  }
}
module.exports = { createPicker }
