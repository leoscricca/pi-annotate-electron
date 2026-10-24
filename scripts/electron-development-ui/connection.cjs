const net = require('node:net')
const { TextDecoder } = require('node:util')
const fs = require('node:fs/promises')
const { createHmac, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto')
const { LIMITS, decodeRequest, decodeReply, decodeEvent, encodePacket } = require('./protocol.cjs')
const { createRegistration, readRegistration, listRegistrations, removeRegistration } = require('./registry.cjs')

const INPUT = new Set(['click', 'fill', 'scroll', 'key'])
const LABEL = 'CnC Mendix Agent development'
const utf8 = new TextDecoder('utf-8', { fatal: true })
function parseFrame(raw) {
  try { return JSON.parse(utf8.decode(raw)) }
  catch { throw failure('PROTOCOL_REFUSED') }
}
function failure(code, outcome = 'refused') { return Object.assign(new Error(code), { code, outcome }) }
// Only a trusted controller factory can prove refusal before resource acquisition.
// This brand never crosses the wire and cannot come from renderer error fields.
class ConnectionRefusal extends Error {
  constructor(code = 'UNAVAILABLE') {
    super(code)
    if (!['UNAVAILABLE', 'STALE_TARGET', 'BUSY'].includes(code)) throw failure('PROTOCOL_REFUSED')
    this.code = code
    this.outcome = 'refused'
  }
}
// Fixed frontend adapters use this brand for public operation outcomes.
class OperationFailure extends Error {
  constructor(code, outcome = 'failed') {
    super(code)
    if (!['STALE_REFERENCE', 'STALE_TARGET', 'UNAVAILABLE', 'BUSY', 'CANCELLED', 'OPERATION_FAILED', 'CLEANUP_BLOCKED'].includes(code)
      || !['refused', 'failed', 'unknown', 'revoked', 'blocked'].includes(outcome)) throw failure('PROTOCOL_REFUSED')
    this.code = code
    this.outcome = outcome
  }
}
function mac(token, ...parts) { return createHmac('sha256', token).update(parts.join('\0')).digest('hex') }
function equal(actual, expected) {
  return typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}
function authPacket(raw, kind, fields) {
  if (raw.length > LIMITS.command) throw failure('PROTOCOL_REFUSED')
  const value = parseFrame(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.kind !== kind
    || Object.keys(value).sort().join(',') !== ['version', 'kind', ...fields].sort().join(',')) throw failure('PROTOCOL_REFUSED')
  return value
}
function bounded(promise, ms, code, outcome = 'failed') {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(failure(code, outcome)), ms); timer.unref() })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
function frames(socket, limit, receive, closed) {
  let buffer = Buffer.alloc(0)
  const pipe = {
    send(value) {
      const raw = encodePacket(value)
      if (socket.destroyed || socket.writableLength + Buffer.byteLength(raw) > 2 * LIMITS.result + LIMITS.command) throw failure('UNAVAILABLE')
      socket.write(raw)
    },
    flush(value) {
      const raw = encodePacket(value)
      if (socket.destroyed || socket.writableLength + Buffer.byteLength(raw) > 2 * LIMITS.result + LIMITS.command) return Promise.reject(failure('UNAVAILABLE'))
      return new Promise((resolve, reject) => {
        socket.write(raw, error => error ? reject(failure('UNAVAILABLE')) : resolve())
      })
    },
    destroy() { socket.destroy() },
  }
  socket.on('error', () => { /* Socket close supplies the terminal transport event. */ })
  socket.on('close', closed)
  socket.on('data', chunk => {
    try {
      buffer = Buffer.concat([buffer, chunk])
      let split
      while ((split = buffer.indexOf(10)) !== -1) {
        if (split > limit || split === 0) throw failure('PROTOCOL_REFUSED')
        const raw = buffer.subarray(0, split); buffer = buffer.subarray(split + 1)
        receive(raw)
        if (socket.destroyed) return
      }
      if (buffer.length > limit) throw failure('PROTOCOL_REFUSED')
    } catch { pipe.destroy() }
  })
  return pipe
}

async function createDevelopmentBridge({ directory, targets, openTarget, label = LABEL, handshakeMs = 3000, requestMs = 10_000, cleanupMs = 5000 }) {
  if (typeof label !== 'string' || !label || label.length > 128 || /[\x00-\x1f\x7f]/.test(label)) throw failure('PROTOCOL_REFUSED')
  const registration = await createRegistration(directory)
  const leases = new Map()
  const sockets = new Set()
  let stopped = false
  let closePromise
  const metadata = () => targets().map(value => ({ kind: 'attached-development', instance: registration.instance,
    window: value.window, generation: value.generation, label, capabilities: value.capabilities }))
  const current = lease => !stopped && !lease.revoked && metadata().some(value => value.window === lease.binding.window && value.generation === lease.binding.generation)
  function retire(lease, reason, { waitForSettlement = false } = {}) {
    if (!lease.cleanup) {
      lease.revoked = true
      try { lease.pipe.send({ version: 1, kind: 'revoked', binding: lease.binding, reason }) } catch { /* Delivery is already revoked. */ }
      lease.cleanup = (async () => {
        let controller
        try { controller = await lease.opening }
        catch (error) {
          if (!(error instanceof ConnectionRefusal)) throw error
          if (leases.get(lease.binding.window) === lease) leases.delete(lease.binding.window)
          return
        }
        let cleanupError
        try { await controller.close(reason) } catch (error) { cleanupError = error }
        await Promise.allSettled([...lease.jobs])
        if (cleanupError) throw cleanupError
        // Only this server path can certify actual controller and job settlement.
        try { await bounded(lease.pipe.flush({ version: 1, kind: 'cleanup-complete', binding: lease.binding }), cleanupMs, 'UNAVAILABLE') }
        catch { /* Lost delivery leaves the client unconfirmed, not the resources unclean. */ }
        if (leases.get(lease.binding.window) === lease) leases.delete(lease.binding.window)
      })()
      lease.cleanup.catch(() => { lease.blocked = true })
    }
    if (waitForSettlement) return lease.cleanup
    return bounded(lease.cleanup, cleanupMs, 'CLEANUP_BLOCKED', 'blocked')
      .catch(() => { throw failure('CLEANUP_BLOCKED', 'blocked') })
  }
  const server = net.createServer(socket => {
    sockets.add(socket)
    let authenticated = false
    let lease
    const challenge = randomBytes(32).toString('hex')
    const timer = setTimeout(() => socket.destroy(), handshakeMs); timer.unref()
    const pipe = frames(socket, LIMITS.command, raw => {
      if (!authenticated) {
        const packet = authPacket(raw, 'authenticate', ['nonce', 'proof'])
        if (typeof packet.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(packet.nonce)
          || !equal(packet.proof, mac(registration.token, 'client', challenge, packet.nonce))) throw failure('PROTOCOL_REFUSED')
        authenticated = true; clearTimeout(timer)
        pipe.send({ version: 1, kind: 'authenticated', proof: mac(registration.token, 'server', challenge, packet.nonce) })
        return
      }
      const packet = decodeRequest(raw, lease?.binding)
      void handle(packet).catch(() => pipe.destroy())
    }, () => {
      clearTimeout(timer); sockets.delete(socket)
      if (lease) void retire(lease, 'TRANSPORT_CLOSED').catch(() => {})
    })
    function respond(packet, ok, value) {
      const scoped = packet.action === 'connect' ? ok : packet.action !== 'list'
      const result = { version: 1, kind: 'reply', request: packet.request, action: packet.action, ok,
        ...(scoped ? { binding: packet.action === 'connect' ? lease.binding : packet.binding } : {}),
        ...(ok ? { value } : { error: value }) }
      pipe.send(result)
    }
    function reject(packet, code, outcome = 'refused') {
      respond(packet, false, { code, message: code.replaceAll('_', ' '), outcome })
    }
    async function handle(packet) {
      if (stopped) { reject(packet, 'UNAVAILABLE'); return }
      if (packet.action === 'list') { respond(packet, true, { targets: metadata() }); return }
      if (packet.action === 'connect') {
        if (lease) { reject(packet, 'BUSY'); return }
        const target = metadata().find(value => value.window === packet.params.window && value.generation === packet.params.generation)
        if (packet.params.instance !== registration.instance || !target) { reject(packet, 'STALE_TARGET'); return }
        if (leases.has(target.window)) { reject(packet, 'BUSY'); return }
        lease = { binding: { ...packet.params, connection: randomUUID() }, jobs: new Set(), revoked: false, blocked: false, pipe }
        leases.set(target.window, lease)
        const owned = lease
        try {
          owned.opening = Promise.resolve(openTarget(owned.binding, event => {
            const kind = event?.kind
            if (kind !== 'annotation' && kind !== 'revoked') return
            if (current(owned) && !socket.destroyed) {
              const packet = kind === 'annotation'
                ? { version: 1, kind: 'annotation', binding: owned.binding, request: event.request, outcome: event.outcome, mode: event.mode, notes: event.notes }
                : { version: 1, kind: 'revoked', binding: owned.binding, reason: event.reason }
              try { pipe.send(packet) }
              catch { pipe.destroy() }
            }
          }))
        } catch (error) { owned.opening = Promise.reject(error) }
        try {
          owned.controller = await bounded(owned.opening, requestMs, 'TIMEOUT')
          if (!current(owned)) throw failure('STALE_TARGET', 'revoked')
          respond(packet, true, { state: 'connected-idle', target })
        } catch (error) {
          if (error instanceof ConnectionRefusal) {
            owned.revoked = true
            if (leases.get(owned.binding.window) === owned) leases.delete(owned.binding.window)
            if (lease === owned) lease = undefined
            reject(packet, error.code)
          } else {
            reject(packet, error.code === 'TIMEOUT' ? 'TIMEOUT' : 'STALE_TARGET', error.code === 'TIMEOUT' ? 'failed' : 'revoked')
            void retire(owned, 'CONNECTION_FAILED').catch(() => {})
          }
        }
        return
      }
      if (!lease) { reject(packet, 'NOT_CONNECTED'); return }
      const owned = lease
      if (packet.action === 'disconnect') {
        try { await retire(owned, 'DISCONNECTED'); respond(packet, true, { state: 'disconnected' }); lease = undefined }
        catch { respond(packet, true, { state: 'cleanup-blocked' }) }
        return
      }
      if (!current(owned) || !owned.controller) { reject(packet, 'STALE_TARGET', 'revoked'); return }
      if (owned.jobs.size && packet.action !== 'cancel') { reject(packet, 'BUSY'); return }
      const work = Promise.resolve().then(() => {
        if (!current(owned)) throw failure('STALE_TARGET', 'revoked')
        return owned.controller.execute(packet.action, packet.params, packet.request)
      })
      owned.jobs.add(work)
      const release = () => owned.jobs.delete(work)
      work.then(release, release)
      try {
        const value = await bounded(work, requestMs, 'TIMEOUT', INPUT.has(packet.action) ? 'unknown' : 'failed')
        if (current(owned)) respond(packet, true, value)
      } catch (error) {
        if (current(owned)) {
          if (error instanceof OperationFailure) reject(packet, error.code, error.outcome)
          else reject(packet, error.code === 'TIMEOUT' ? 'TIMEOUT' : error.code === 'BUSY' ? 'BUSY' : 'OPERATION_FAILED', error.outcome ?? 'failed')
        }
      }
    }
    pipe.send({ version: 1, kind: 'challenge', instance: registration.instance, challenge })
  })
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(registration.socketPath, resolve) })
    await fs.chmod(registration.socketPath, 0o600)
  } catch (error) {
    server.close()
    await removeRegistration(registration)
    throw error
  }
  return {
    instance: registration.instance,
    directory: registration.directory,
    async revoke(window, reason = 'DOCUMENT_CHANGED', { waitForSettlement = false } = {}) {
      const lease = leases.get(window)
      if (lease) await retire(lease, reason, { waitForSettlement })
    },
    close({ waitForSettlement = false } = {}) {
      if (!closePromise) {
        stopped = true
        closePromise = (async () => {
          const cleanup = [...leases.values()].map(lease => retire(lease, 'BRIDGE_CLOSED', { waitForSettlement }))
          const terminal = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
          const results = await Promise.allSettled(cleanup)
          for (const socket of sockets) socket.destroy()
          await bounded(terminal, cleanupMs, 'CLEANUP_BLOCKED', 'blocked')
          const rejected = results.find(result => result.status === 'rejected')
          if (rejected) throw rejected.reason
          await removeRegistration(registration)
        })()
      }
      return closePromise
    },
  }
}

async function dial(registration, { timeoutMs = 10_000, onEvent = () => {}, signal } = {}) {
  if (signal?.aborted) throw failure('CANCELLED', 'revoked')
  const stat = await fs.lstat(registration.socketPath)
  if (!stat.isSocket() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw failure('UNAVAILABLE')
  const socket = net.createConnection(registration.socketPath)
  const terminal = new Promise(resolve => socket.once('close', resolve))
  const abort = () => socket.destroy()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) socket.destroy()
  const pending = new Map()
  let authenticated = false
  let binding
  let revoked = false
  let closed = false
  let inspectionRequired = false
  let annotation
  let annotationActive = false
  let closePromise
  let confirmedClosePromise
  let cleanupConfirmed = false
  let resolveAuth
  let rejectAuth
  const ready = new Promise((resolve, reject) => { resolveAuth = resolve; rejectAuth = reject })
  function failPending(code, outcome, keepDisconnect = false) {
    for (const [id, waiter] of pending) {
      if (keepDisconnect && waiter.packet.action === 'disconnect') continue
      waiter.reject(failure(code, outcome)); pending.delete(id)
    }
  }
  const nonce = randomBytes(32).toString('hex')
  let challenge
  const pipe = frames(socket, LIMITS.result, raw => {
    if (!authenticated) {
      if (!challenge) {
        const packet = authPacket(raw, 'challenge', ['instance', 'challenge'])
        if (packet.instance !== registration.instance || typeof packet.challenge !== 'string' || !/^[a-f0-9]{64}$/.test(packet.challenge)) throw failure('PROTOCOL_REFUSED')
        challenge = packet.challenge
        pipe.send({ version: 1, kind: 'authenticate', nonce, proof: mac(registration.token, 'client', challenge, nonce) })
      } else {
        const packet = authPacket(raw, 'authenticated', ['proof'])
        if (!equal(packet.proof, mac(registration.token, 'server', challenge, nonce))) throw failure('PROTOCOL_REFUSED')
        authenticated = true; resolveAuth()
      }
      return
    }
    const header = parseFrame(raw)
    if (header.kind !== 'reply') {
      if (!binding) return
      const event = decodeEvent(raw, binding, annotation)
      if (event.kind === 'cleanup-complete') cleanupConfirmed = true
      if (event.kind === 'revoked' || event.kind === 'cleanup-complete') { revoked = true; annotationActive = false; failPending('STALE_TARGET', 'revoked', true) }
      else annotationActive = false
      onEvent(event)
      return
    }
    const waiter = pending.get(header.request)
    if (!waiter) return
    const packet = decodeReply(raw, waiter.packet)
    pending.delete(packet.request)
    if (revoked && packet.action !== 'disconnect') { waiter.reject(failure('STALE_TARGET', 'revoked')); return }
    if (!packet.ok) {
      if (INPUT.has(packet.action) && packet.error.outcome === 'unknown') inspectionRequired = true
      const knownRefusal = packet.action === 'connect' && packet.error.outcome === 'refused'
        && ['UNAVAILABLE', 'STALE_TARGET', 'BUSY'].includes(packet.error.code)
      waiter.reject(knownRefusal ? new ConnectionRefusal(packet.error.code) : failure(packet.error.code, packet.error.outcome)); return
    }
    if (packet.action === 'connect') binding = packet.binding
    if (packet.action === 'snapshot') inspectionRequired = false
    waiter.resolve(packet)
  }, () => {
    closed = true; signal?.removeEventListener('abort', abort)
    rejectAuth(failure(signal?.aborted ? 'CANCELLED' : 'UNAVAILABLE', 'revoked'))
    failPending(signal?.aborted ? 'CANCELLED' : 'UNAVAILABLE', signal?.aborted ? 'revoked' : 'unknown')
  })
  try { await bounded(ready, Math.min(timeoutMs, 3000), 'UNAVAILABLE') }
  catch (error) { pipe.destroy(); await bounded(terminal, 2000, 'CLEANUP_BLOCKED', 'blocked'); throw error }
  const client = {
    get binding() { return binding },
    get active() { return !closed && !revoked && Boolean(binding) },
    get cleanupConfirmed() { return cleanupConfirmed },
    get annotationRequest() { return annotationActive ? annotation : undefined },
    async request(action, params = {}) {
      if (closed || (revoked && action !== 'disconnect')) throw failure('UNAVAILABLE', 'revoked')
      if (inspectionRequired && INPUT.has(action)) throw failure('INSPECTION_REQUIRED')
      if (action === 'annotate' && annotationActive) throw failure('BUSY')
      const previousAnnotation = annotation
      const packet = { version: 1, kind: 'request', request: randomUUID(), action, params,
        ...(action === 'list' || action === 'connect' ? {} : { binding }) }
      const raw = encodePacket(packet)
      decodeRequest(raw, binding)
      if (action === 'annotate') { annotation = packet.request; annotationActive = true }
      let resolve
      let reject
      const promise = new Promise((yes, no) => { resolve = yes; reject = no })
      pending.set(packet.request, { packet, resolve, reject })
      try {
        pipe.send(packet)
        return await bounded(promise, timeoutMs, 'TIMEOUT', INPUT.has(action) ? 'unknown' : 'failed')
      } catch (error) {
        if (action === 'annotate' && error.outcome === 'refused' && annotation === packet.request) { annotation = previousAnnotation; annotationActive = false }
        if (INPUT.has(action) && error.outcome === 'unknown') inspectionRequired = true
        throw error
      } finally { pending.delete(packet.request) }
    },
    close() {
      if (cleanupConfirmed) {
        if (!confirmedClosePromise) confirmedClosePromise = (async () => {
          pipe.destroy()
          await bounded(terminal, 2000, 'CLEANUP_BLOCKED', 'blocked')
        })()
        return confirmedClosePromise
      }
      if (!closePromise) closePromise = (async () => {
        try {
          if (binding) {
            if (closed) throw failure('CLEANUP_BLOCKED', 'blocked')
            const packet = await client.request('disconnect')
            if (packet.value.state !== 'disconnected') throw failure('CLEANUP_BLOCKED', 'blocked')
          }
        } finally { pipe.destroy(); await bounded(terminal, 2000, 'CLEANUP_BLOCKED', 'blocked') }
      })()
      return closePromise
    },
  }
  return client
}
async function discoverDevelopmentTargets({ directory, timeoutMs = 1000 } = {}) {
  const registrations = await listRegistrations(directory)
  const groups = await Promise.all(registrations.map(async registration => {
    let client
    try {
      client = await dial(registration, { timeoutMs })
      return (await client.request('list')).value.targets
    } catch { return [] }
    finally { if (client) await client.close() }
  }))
  const targets = groups.flat()
  if (targets.length > 64) throw failure('DEV_UI_DISCOVERY_LIMIT')
  return targets
}
async function connectDevelopmentTarget(target, { session, directory, timeoutMs, onEvent, signal } = {}) {
  if (target.kind !== 'attached-development') throw failure('STALE_TARGET')
  const registration = await readRegistration(directory, target.instance)
  const client = await dial(registration, { timeoutMs, onEvent, signal })
  try {
    await client.request('connect', { session, instance: target.instance, window: target.window, generation: target.generation })
    return client
  } catch (error) { await client.close(); throw error }
}

module.exports = { createDevelopmentBridge, discoverDevelopmentTargets, connectDevelopmentTarget, ConnectionRefusal, OperationFailure }
