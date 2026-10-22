const { timingSafeEqual } = require('node:crypto')

const CONTROL_BYTES = 16 * 1024
const RESULT_BYTES = 16 * 1024 * 1024
function refuse(code = 'ANNOTATION_PACKET_REFUSED') { throw new Error(code) }
function record(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(); return value }
function keys(value, required, optional = []) {
  record(value)
  const actual = Object.keys(value)
  if (required.some(key => !actual.includes(key)) || actual.some(key => !required.includes(key) && !optional.includes(key))) refuse()
}
function text(value, maximum = 4096) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) refuse()
  return value
}
function number(value, min, max) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) refuse(); return value }
function integer(value, min, max) { number(value, min, max); if (!Number.isInteger(value)) refuse(); return value }
function identity(value) { text(value, 128); if (!/^[a-zA-Z0-9._-]{1,128}$/.test(value)) refuse(); return value }
function size(value, maximum) {
  try { if (Buffer.byteLength(JSON.stringify(value)) > maximum) refuse('ANNOTATION_PAYLOAD_LIMIT') }
  catch (error) { if (error.message === 'ANNOTATION_PAYLOAD_LIMIT') throw error; refuse() }
}
function mode(value) { if (value !== 'crop' && value !== 'none') refuse(); return value }
function viewport(value) {
  keys(value, ['width', 'height', 'dpr', 'scrollX', 'scrollY'])
  const out = { width: integer(value.width, 1, 8192), height: integer(value.height, 1, 8192), dpr: number(value.dpr, 0.5, 4),
    scrollX: number(value.scrollX, 0, 1_000_000), scrollY: number(value.scrollY, 0, 1_000_000) }
  if (out.width * out.height * out.dpr * out.dpr > 16_777_216) refuse('ANNOTATION_PAYLOAD_LIMIT')
  return out
}
function parseBoot(value) {
  size(value, CONTROL_BYTES)
  keys(value, ['kind', 'version', 'session', 'target', 'token', 'foreground'])
  if (value.kind !== 'boot' || value.version !== 1 || typeof value.foreground !== 'boolean'
    || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) refuse()
  return { kind: 'boot', version: 1, session: identity(value.session), target: identity(value.target), token: value.token, foreground: value.foreground }
}
function parseOwner(value, owner) {
  size(value, CONTROL_BYTES)
  keys(value, ['kind', 'version', 'session', 'target', 'token', 'request'], ['mode', 'generation', 'timeoutMs', 'cancelFor'])
  if (value.version !== 1 || value.session !== owner.session || value.target !== owner.target
    || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)
    || !timingSafeEqual(Buffer.from(value.token, 'hex'), Buffer.from(owner.token, 'hex'))) refuse('ANNOTATION_OWNER_REFUSED')
  const request = identity(value.request)
  if (['status', 'shutdown'].includes(value.kind)) {
    keys(value, ['kind', 'version', 'session', 'target', 'token', 'request'])
    return { kind: value.kind, request }
  }
  if (value.kind === 'cancel') {
    keys(value, ['kind', 'version', 'session', 'target', 'token', 'request', 'cancelFor', 'generation'])
    return { kind: 'cancel', request, cancelFor: identity(value.cancelFor), generation: integer(value.generation, 1, 1_000_000) }
  }
  if (value.kind !== 'start') refuse('ANNOTATION_OPERATION_REFUSED')
  keys(value, ['kind', 'version', 'session', 'target', 'token', 'request', 'mode', 'generation'], ['timeoutMs'])
  return { kind: 'start', request, mode: mode(value.mode), generation: integer(value.generation, 1, 1_000_000),
    timeoutMs: value.timeoutMs === undefined ? 300_000 : integer(value.timeoutMs, 1000, 300_000) }
}
function admitRenderer(event, window, url) {
  try {
    return !!window && !window.isDestroyed() && !window.webContents.isDestroyed() && event.sender === window.webContents
      && !!event.senderFrame && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === url
  } catch { return false } // A frame can disappear during navigation.
}
function selection(value) {
  keys(value, ['selector', 'tag', 'role', 'name', 'comment', 'bounds', 'styles'], ['image'])
  if (value.image !== undefined && typeof value.image !== 'boolean') refuse()
  keys(value.bounds, ['x', 'y', 'width', 'height'])
  keys(value.styles, ['display', 'fontSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'])
  const bounds = { x: number(value.bounds.x, 0, 1_000_000), y: number(value.bounds.y, 0, 1_000_000),
    width: number(value.bounds.width, 1, 8192), height: number(value.bounds.height, 1, 8192) }
  const styles = Object.fromEntries(Object.entries(value.styles).map(([key, value]) => [key, text(value, 128)]))
  const selector = text(value.selector, 2048)
  if (!/^body(?: > [a-z]+:nth-of-type\([1-9][0-9]{0,4}\))+$/.test(selector)
    || !/ > button:nth-of-type\([1-9][0-9]{0,4}\)$/.test(selector) || value.tag !== 'button' || value.role !== 'button') refuse()
  return { ...(value.image === undefined ? {} : { image: value.image }), selector, tag: 'button', role: 'button',
    name: text(value.name, 512), comment: text(value.comment), bounds, styles }
}
function parseRenderer(value) {
  size(value, RESULT_BYTES)
  record(value)
  if (['hello', 'status'].includes(value.kind)) { keys(value, ['kind']); return { kind: value.kind } }
  if (value.kind === 'cancel') {
    keys(value, ['kind', 'request', 'generation'])
    return { kind: 'cancel', request: identity(value.request), generation: integer(value.generation, 1, 1_000_000) }
  }
  if (!['capture', 'complete'].includes(value.kind)) refuse('ANNOTATION_OPERATION_REFUSED')
  const base = ['kind', 'request', 'generation', 'revision', 'viewport', 'mode']
  keys(value, value.kind === 'complete' ? [...base, 'selections', 'images'] : base)
  const out = { kind: value.kind, request: identity(value.request), generation: integer(value.generation, 1, 1_000_000),
    revision: integer(value.revision, 0, 1_000_000), viewport: viewport(value.viewport), mode: mode(value.mode) }
  if (out.kind === 'capture') { if (out.mode !== 'crop') refuse(); return out }
  if (!Array.isArray(value.selections) || value.selections.length < 1 || value.selections.length > 10
    || !Array.isArray(value.images) || value.images.length > 10) refuse()
  const selections = value.selections.map(selection)
  size(selections, 256 * 1024)
  const images = value.images.map(image => {
    keys(image, ['index', 'dataUrl'])
    return { index: integer(image.index, 1, selections.length), dataUrl: text(image.dataUrl, 14 * 1024 * 1024) }
  })
  if (new Set(images.map(image => image.index)).size !== images.length
    || out.mode === 'none' && images.length !== 0
    || out.mode === 'crop' && (images.length !== selections.filter(item => item.image !== false).length
      || images.some(image => selections[image.index - 1].image === false))) refuse()
  return { ...out, selections, images }
}

module.exports = { parseBoot, parseOwner, parseRenderer, admitRenderer, viewport }
