const { TextDecoder } = require('node:util')

const LIMITS = Object.freeze({ command: 16 * 1024, result: 2 * 1024 * 1024, nodes: 2000,
  diagnostics: 200, imageBytes: 10 * 1024 * 1024, pixels: 16_777_216 })
const TARGET_KINDS = Object.freeze(['owned-synthetic', 'attached-development'])
const STATES = ['connected-idle', 'picker-active', 'busy', 'revoked', 'failed', 'cleanup-blocked', 'disconnected']
const CAPABILITIES = ['annotation', 'snapshot', 'screenshot', 'input', 'diagnostics']
const BINDING_KEYS = ['session', 'instance', 'window', 'connection', 'generation']
const utf8 = new TextDecoder('utf-8', { fatal: true })

function refuse(code = 'DEV_UI_PACKET_REFUSED') { throw new Error(code) }
function check(condition, code) { if (!condition) refuse(code) }
function record(value, allowed, required = allowed) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value))
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  check(Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)))
}
function text(value, max = 4096, min = 0) { check(typeof value === 'string' && value.length >= min && value.length <= max) }
function id(value) { check(typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value)) }
function number(value, min, max) { check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) }
function integer(value, min = 1, max = Number.MAX_SAFE_INTEGER) { number(value, min, max); check(Number.isSafeInteger(value)) }
function boolean(value) { check(typeof value === 'boolean') }
function oneOf(value, choices) { check(choices.includes(value)) }
function array(value, max, visit) { check(Array.isArray(value) && value.length <= max); value.forEach(visit) }
function optional(value, key, visit) { if (Object.hasOwn(value, key)) visit(value[key]) }
function decode(raw, limit) {
  check(typeof raw === 'string' || Buffer.isBuffer(raw))
  check(Buffer.byteLength(raw) <= limit, 'DEV_UI_PAYLOAD_LIMIT')
  try { return JSON.parse(utf8.decode(Buffer.isBuffer(raw) ? raw : Buffer.from(raw))) }
  catch { refuse() }
}
function binding(value) {
  record(value, BINDING_KEYS)
  for (const key of BINDING_KEYS.slice(0, -1)) id(value[key])
  integer(value.generation)
}
function assertBinding(actual, expected) {
  check(BINDING_KEYS.every(key => actual[key] === expected[key]), 'DEV_UI_STALE_IDENTITY')
}
function reference(value, required = true) {
  if (required || Object.hasOwn(value, 'ref')) { id(value.ref); integer(value.revision) }
  else check(!Object.hasOwn(value, 'revision'))
}
function rect(value) {
  record(value, ['x', 'y', 'width', 'height'])
  number(value.x, -1_000_000, 1_000_000); number(value.y, -1_000_000, 1_000_000)
  number(value.width, 0, 8192); number(value.height, 0, 8192)
}
function viewport(value) {
  record(value, ['width', 'height', 'dpr', 'scrollX', 'scrollY'])
  integer(value.width, 1, 8192); integer(value.height, 1, 8192); number(value.dpr, 0.5, 4)
  number(value.scrollX, 0, 1_000_000); number(value.scrollY, 0, 1_000_000)
  check(value.width * value.height * value.dpr ** 2 <= LIMITS.pixels, 'DEV_UI_PAYLOAD_LIMIT')
}
function target(value) {
  record(value, ['kind', 'instance', 'window', 'generation', 'label', 'capabilities'])
  check(value.kind === 'attached-development')
  id(value.instance); id(value.window); integer(value.generation); text(value.label, 128, 1)
  array(value.capabilities, CAPABILITIES.length, item => oneOf(item, CAPABILITIES))
  check(new Set(value.capabilities).size === value.capabilities.length)
}
function image(value) {
  record(value, ['path', 'sha256', 'width', 'height', 'bytes', 'mime'])
  text(value.path, 4096, 1); text(value.sha256, 64, 64); check(/^[a-f0-9]{64}$/.test(value.sha256)); check(value.mime === 'image/png')
  integer(value.width, 1, 8192); integer(value.height, 1, 8192); integer(value.bytes, 1, LIMITS.imageBytes)
  check(value.width * value.height <= LIMITS.pixels, 'DEV_UI_PAYLOAD_LIMIT')
}

const parameters = {
  list(value) { record(value, []) },
  connect(value) {
    record(value, ['session', 'instance', 'window', 'generation'])
    id(value.session); id(value.instance); id(value.window); integer(value.generation)
  },
  status(value) { record(value, []) },
  snapshot(value) { record(value, []) },
  screenshot(value) { record(value, ['ref', 'revision'], []); reference(value, false) },
  click(value) {
    record(value, ['ref', 'revision', 'button', 'count'], ['ref', 'revision']); reference(value)
    optional(value, 'button', item => oneOf(item, ['left', 'middle', 'right']))
    optional(value, 'count', item => integer(item, 1, 2))
  },
  fill(value) { record(value, ['ref', 'revision', 'text']); reference(value); text(value.text) },
  scroll(value) {
    record(value, ['ref', 'revision', 'direction', 'amount'], ['direction', 'amount']); reference(value, false)
    oneOf(value.direction, ['up', 'down', 'left', 'right']); integer(value.amount, 1, 10_000)
  },
  key(value) { record(value, ['key']); text(value.key, 64, 1); check(/^[A-Za-z0-9+_.-]+$/.test(value.key)) },
  console(value) { record(value, ['clear'], []); optional(value, 'clear', boolean) },
  exceptions(value) { record(value, ['clear'], []); optional(value, 'clear', boolean) },
  network(value) { record(value, ['clear'], []); optional(value, 'clear', boolean) },
  annotate(value) { record(value, ['mode']); oneOf(value.mode, ['none', 'crop']) },
  cancel(value) { record(value, ['annotation']); id(value.annotation) },
  disconnect(value) { record(value, []) },
}
const ACTIONS = Object.freeze(Object.keys(parameters))

function decodeRequest(raw, currentBinding) {
  const value = decode(raw, LIMITS.command)
  record(value, ['version', 'kind', 'request', 'action', 'params', 'binding'], ['version', 'kind', 'request', 'action', 'params'])
  check(value.version === 1 && value.kind === 'request'); id(value.request)
  text(value.action, 32, 1); check(Object.hasOwn(parameters, value.action)); parameters[value.action](value.params)
  if (value.action === 'list' || value.action === 'connect') check(!Object.hasOwn(value, 'binding'))
  else { binding(value.binding); if (currentBinding) assertBinding(value.binding, currentBinding) }
  return value
}
function snapshotNode(value) {
  record(value, ['ref', 'depth', 'tag', 'role', 'name', 'rect', 'value', 'disabled', 'focused'], ['ref', 'depth', 'tag', 'role', 'name', 'rect'])
  id(value.ref); integer(value.depth, 0, 128); text(value.tag, 64, 1); text(value.role, 64); text(value.name); rect(value.rect)
  optional(value, 'value', item => text(item)); optional(value, 'disabled', boolean); optional(value, 'focused', boolean)
}
function diagnostic(value, kind) {
  record(value, ['kind', 'message', 'source', 'line', 'column', 'timestamp', 'status', 'resourceType', 'stack'], ['kind', 'message', 'timestamp'])
  check(value.kind === kind); text(value.message, 8192); number(value.timestamp, 0, Number.MAX_SAFE_INTEGER)
  optional(value, 'source', item => text(item)); optional(value, 'stack', item => text(item, 16_384))
  optional(value, 'line', item => integer(item, 0)); optional(value, 'column', item => integer(item, 0))
  optional(value, 'status', item => integer(item, 100, 599)); optional(value, 'resourceType', item => text(item, 64))
  if (kind !== 'network') check(!Object.hasOwn(value, 'status') && !Object.hasOwn(value, 'resourceType'))
}
function resultValue(action, value, expectedBinding) {
  if (action === 'list') {
    record(value, ['targets']); array(value.targets, 64, target)
  } else if (action === 'connect') {
    record(value, ['state', 'target']); check(value.state === 'connected-idle'); target(value.target)
    check(['instance', 'window', 'generation'].every(key => value.target[key] === expectedBinding[key]), 'DEV_UI_STALE_IDENTITY')
  } else if (action === 'snapshot') {
    record(value, ['revision', 'viewport', 'nodes', 'truncated']); integer(value.revision); viewport(value.viewport)
    array(value.nodes, LIMITS.nodes, snapshotNode); boolean(value.truncated)
    check(new Set(value.nodes.map(node => node.ref)).size === value.nodes.length)
  } else if (action === 'screenshot') {
    record(value, ['image', 'viewport']); image(value.image); viewport(value.viewport)
  } else if (['click', 'fill', 'scroll', 'key'].includes(action)) {
    record(value, ['outcome']); oneOf(value.outcome, ['dispatched', 'observed'])
  } else if (['console', 'exceptions', 'network'].includes(action)) {
    record(value, ['items', 'truncated']); boolean(value.truncated)
    const kind = action === 'exceptions' ? 'exception' : action
    array(value.items, LIMITS.diagnostics, item => diagnostic(item, kind))
  } else if (action === 'annotate') {
    record(value, ['state', 'annotation', 'mode']); check(value.state === 'picker-active'); id(value.annotation)
    oneOf(value.mode, ['none', 'crop'])
  } else {
    record(value, ['state', 'operation', 'message'], ['state']); oneOf(value.state, STATES)
    optional(value, 'operation', id); optional(value, 'message', item => text(item, 256))
    if (action === 'disconnect') check(value.state === 'disconnected' || value.state === 'cleanup-blocked')
    if (action === 'cancel') check(value.state === 'connected-idle' || value.state === 'cleanup-blocked')
  }
}
function decodeReply(raw, request) {
  const value = decode(raw, LIMITS.result)
  record(value, ['version', 'kind', 'request', 'action', 'binding', 'ok', 'value', 'error'], ['version', 'kind', 'request', 'action', 'ok'])
  check(value.version === 1 && value.kind === 'reply'); boolean(value.ok)
  check(value.request === request.request && value.action === request.action, 'DEV_UI_CORRELATION_REFUSED')
  if (request.action === 'list' || (request.action === 'connect' && !value.ok)) check(!Object.hasOwn(value, 'binding'))
  else {
    binding(value.binding)
    if (request.action === 'connect') {
      check(['session', 'instance', 'window', 'generation'].every(key => value.binding[key] === request.params[key]), 'DEV_UI_STALE_IDENTITY')
    } else assertBinding(value.binding, request.binding)
  }
  if (value.ok) {
    check(Object.hasOwn(value, 'value') && !Object.hasOwn(value, 'error')); resultValue(value.action, value.value, value.binding)
    if (request.action === 'annotate') check(value.value.annotation === request.request && value.value.mode === request.params.mode, 'DEV_UI_CORRELATION_REFUSED')
  } else {
    check(Object.hasOwn(value, 'error') && !Object.hasOwn(value, 'value'))
    record(value.error, ['code', 'message', 'outcome'])
    oneOf(value.error.code, ['BUSY', 'STALE_TARGET', 'STALE_REFERENCE', 'NOT_CONNECTED', 'UNAVAILABLE', 'CLEANUP_BLOCKED', 'TIMEOUT', 'CANCELLED', 'OPERATION_FAILED', 'PROTOCOL_REFUSED'])
    text(value.error.message, 256, 1); oneOf(value.error.outcome, ['refused', 'failed', 'unknown', 'revoked', 'blocked'])
  }
  return value
}
function decodeEvent(raw, currentBinding, annotationRequest) {
  const value = decode(raw, LIMITS.result)
  check(value !== null && typeof value === 'object' && value.version === 1)
  if (value.kind === 'cleanup-complete') {
    record(value, ['version', 'kind', 'binding'])
  } else if (value.kind === 'revoked') {
    record(value, ['version', 'kind', 'binding', 'reason']); id(value.reason)
  } else {
    record(value, ['version', 'kind', 'binding', 'request', 'outcome', 'mode', 'notes'])
    check(value.kind === 'annotation'); id(value.request)
    check(value.request === annotationRequest, 'DEV_UI_CORRELATION_REFUSED')
    oneOf(value.outcome, ['submitted', 'cancelled']); oneOf(value.mode, ['none', 'crop'])
    array(value.notes, 10, note => {
      record(note, ['comment', 'selector', 'tag', 'name', 'rect', 'image'], ['comment', 'selector', 'tag', 'name', 'rect'])
      text(note.comment, 4096, 1); text(note.selector, 4096, 1); text(note.tag, 64, 1); text(note.name); rect(note.rect)
      if (Object.hasOwn(note, 'image')) { check(value.mode === 'crop'); image(note.image) }
    })
    check(value.outcome === 'submitted' ? value.notes.length > 0 : value.notes.length === 0)
  }
  binding(value.binding); assertBinding(value.binding, currentBinding)
  return value
}
function encodePacket(value) {
  const raw = JSON.stringify(value)
  check(typeof raw === 'string' && Buffer.byteLength(raw) <= (value.kind === 'request' ? LIMITS.command : LIMITS.result), 'DEV_UI_PAYLOAD_LIMIT')
  return raw + '\n'
}

module.exports = { LIMITS, TARGET_KINDS, ACTIONS, decodeRequest, decodeReply, decodeEvent, encodePacket, assertBinding, validateViewport: viewport }
