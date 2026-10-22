// One annotation request owns its actual operations until cleanup is confirmed.
class AnnotationRequestLane {
  constructor({ generation, cleanup }) {
    this.generation = generation
    this.cleanup = cleanup
    this.current = null
  }
  status() {
    const request = this.current
    return request ? { phase: request.phase, request: request.id, generation: request.generation, pending: request.pending.size }
      : { phase: 'idle', request: null, generation: this.generation(), pending: 0 }
  }
  begin({ request: id, generation, timeoutMs }) {
    if (this.current) throw new Error('ANNOTATION_TARGET_BUSY')
    if (generation !== this.generation()) throw new Error('ANNOTATION_STALE_GENERATION')
    let resolve, reject
    const result = new Promise((yes, no) => { resolve = yes; reject = no })
    const request = { id, generation, phase: 'active', revoked: false, pending: new Set(), controller: new AbortController(),
      result, resolve, reject, reason: null, value: undefined, cleanupStarted: false, cleanupDone: false, cleanupError: false }
    this.current = request
    request.timer = setTimeout(() => this.revoke(request, 'ANNOTATION_DEADLINE'), timeoutMs)
    request.timer.unref()
    return { result, signal: request.controller.signal }
  }
  assertCurrent(id) {
    const request = this.current
    if (!request || request.id !== id || request.revoked) throw new Error('ANNOTATION_REQUEST_REVOKED')
    if (request.generation !== this.generation()) {
      this.revoke(request, 'ANNOTATION_STALE_GENERATION')
      throw new Error('ANNOTATION_STALE_GENERATION')
    }
    return request
  }
  async work(id, operation) {
    const request = this.assertCurrent(id)
    if (request.phase !== 'active') throw new Error('ANNOTATION_REQUEST_REVOKED')
    const actual = Promise.resolve().then(() => {
      this.assertCurrent(id)
      return operation(request.controller.signal)
    })
    request.pending.add(actual)
    try {
      const value = await actual
      this.assertCurrent(id)
      return value
    } catch (error) {
      if (!request.revoked) this.revoke(request, 'ANNOTATION_OPERATION_FAILED')
      throw error
    } finally {
      request.pending.delete(actual)
      this.finalize(request)
    }
  }
  complete(id, value) {
    const request = this.assertCurrent(id)
    if (request.phase !== 'active') throw new Error('ANNOTATION_REQUEST_REVOKED')
    request.phase = 'finishing'
    request.value = value
    clearTimeout(request.timer)
    this.startCleanup(request)
    return request.result
  }
  cancel(id, reason = 'ANNOTATION_CANCELLED') {
    const request = this.current
    if (!request || request.id !== id) return Promise.resolve({ phase: 'not-current' })
    this.revoke(request, reason)
    return request.result.then(() => ({ phase: 'cancelled' }), error => {
      if (request.cleanupError) throw error
      return { phase: 'cancelled' }
    })
  }
  invalidate() {
    const request = this.current
    return request ? this.cancel(request.id, 'ANNOTATION_STALE_GENERATION') : Promise.resolve({ phase: 'idle' })
  }
  revoke(request, reason) {
    if (request.cleanupError) return
    if (!request.revoked) {
      request.revoked = true
      request.reason = reason
      request.phase = 'cancelling'
      clearTimeout(request.timer)
      request.controller.abort()
    }
    this.startCleanup(request)
  }
  startCleanup(request) {
    if (request.cleanupStarted) return
    request.cleanupStarted = true
    const actual = Promise.resolve().then(() => this.cleanup({ request: request.id, generation: request.generation }))
    void actual.then(() => { request.cleanupDone = true; this.finalize(request) }, () => {
      request.cleanupDone = true
      request.cleanupError = true
      request.phase = 'blocked'
      this.finalize(request)
    })
  }
  finalize(request) {
    if (this.current !== request || !request.cleanupDone || request.pending.size) return
    if (request.cleanupError) {
      request.reject(new Error('ANNOTATION_CLEANUP_UNCONFIRMED'))
      return // Retain the lease. A replacement cannot mask an unknown cleanup outcome.
    }
    if (!request.revoked && request.generation !== this.generation()) {
      request.revoked = true
      request.reason = 'ANNOTATION_STALE_GENERATION'
    }
    this.current = null
    if (request.revoked) request.reject(new Error(request.reason))
    else request.resolve(request.value)
  }
}
module.exports = { AnnotationRequestLane }
