const { LIMITS } = require('./protocol.cjs')

async function startDiagnostics(frontend, isCurrent) {
  const records = { console: [], exception: [], network: [] }
  const sizes = { console: 0, exception: 0, network: 0 }
  const truncated = { console: false, exception: false, network: false }
  const requests = new Map()
  let active = false
  let since = 0
  function text(kind, value, max = 8192) {
    const output = String(value ?? '')
    if (output.length > max) truncated[kind] = true
    return output.slice(0, max)
  }
  function append(kind, item) {
    const bytes = Buffer.byteLength(JSON.stringify(item))
    records[kind].push({ item, bytes }); sizes[kind] += bytes
    while (records[kind].length > LIMITS.diagnostics || sizes[kind] > LIMITS.result - 65536) {
      sizes[kind] -= records[kind].shift().bytes; truncated[kind] = true
    }
  }
  function location(kind, frames = []) {
    const result = {}
    const frame = frames[0]
    if (typeof frame?.url === 'string') result.source = text(kind, frame.url, 4096)
    if (Number.isSafeInteger(frame?.lineNumber) && frame.lineNumber >= 0) result.line = frame.lineNumber + 1
    if (Number.isSafeInteger(frame?.columnNumber) && frame.columnNumber >= 0) result.column = frame.columnNumber + 1
    return result
  }
  function message(_event, method, params, sessionId) {
    if (!active || !isCurrent() || sessionId || !params || typeof params !== 'object') return
    if (method === 'Runtime.consoleAPICalled') {
      if (!['error', 'warning', 'assert'].includes(params.type) || !Number.isFinite(params.timestamp) || params.timestamp < since) return
      const args = Array.isArray(params.args) ? params.args : []
      if (args.length > 32) truncated.console = true
      const value = args.slice(0, 32).map(arg => text('console', Object.hasOwn(arg, 'value')
        ? (arg.value === null ? 'null' : arg.value) : arg.unserializableValue ?? arg.description ?? arg.type)).join(' ')
      append('console', { kind: 'console', message: text('console', value), timestamp: Date.now(),
        ...location('console', params.stackTrace?.callFrames) })
    } else if (method === 'Log.entryAdded') {
      const entry = params.entry
      if (!entry || !['error', 'warning'].includes(entry.level) || !Number.isFinite(entry.timestamp) || entry.timestamp < since) return
      append('console', { kind: 'console', message: text('console', entry.text), timestamp: Date.now(),
        ...location('console', entry.stackTrace?.callFrames ?? [entry]) })
    } else if (method === 'Runtime.exceptionThrown') {
      if (!Number.isFinite(params.timestamp) || params.timestamp < since || !params.exceptionDetails) return
      const detail = params.exceptionDetails
      const item = { kind: 'exception', message: text('exception', detail.exception?.description ?? detail.text), timestamp: Date.now(),
        ...location('exception', detail.stackTrace?.callFrames ?? [detail]) }
      if (detail.exception?.description) item.stack = text('exception', detail.exception.description, 16384)
      append('exception', item)
    } else if (method === 'Network.requestWillBeSent') {
      if (typeof params.requestId !== 'string' || typeof params.request?.url !== 'string' || !Number.isFinite(params.wallTime) || params.wallTime * 1000 < since) return
      if (requests.size >= 1000) { requests.delete(requests.keys().next().value); truncated.network = true }
      // Project only URL/type. Never retain request headers, cookies or bodies.
      requests.set(params.requestId, { url: text('network', params.request.url, 4096), type: text('network', params.type, 64) })
    } else if (method === 'Network.responseReceived') {
      const request = requests.get(params.requestId)
      const status = params.response?.status
      if (!request || !Number.isInteger(status) || status < 400 || status > 599) return
      append('network', { kind: 'network', message: text('network', `HTTP ${status} ${request.url}`), timestamp: Date.now(),
        source: request.url, status, resourceType: request.type })
      request.failed = true
    } else if (method === 'Network.loadingFailed') {
      const request = requests.get(params.requestId)
      if (request && !request.failed) append('network', { kind: 'network', message: text('network', params.errorText), timestamp: Date.now(),
        source: request.url, resourceType: request.type })
      requests.delete(params.requestId)
    } else if (method === 'Network.loadingFinished') requests.delete(params.requestId)
  }
  function stop() {
    active = false; frontend.off('message', message); requests.clear()
    for (const kind of Object.keys(records)) { records[kind] = []; sizes[kind] = 0; truncated[kind] = false }
  }
  frontend.on('message', message)
  try {
    // Keep replayed Runtime history outside the active connection interval.
    await frontend.sendCommand('Runtime.enable')
    await frontend.sendCommand('Network.enable')
    await frontend.sendCommand('Log.enable')
    since = Date.now(); active = true
  } catch (error) { stop(); throw error }
  return {
    read(kind, clear = false) {
      const result = { items: records[kind].map(entry => entry.item), truncated: truncated[kind] }
      if (clear) { records[kind] = []; sizes[kind] = 0; truncated[kind] = false }
      return result
    },
    stop,
  }
}
module.exports = { startDiagnostics }
