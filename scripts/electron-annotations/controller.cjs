const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { nativeImage } = require('electron')
const { AnnotationRequestLane } = require('./request.cjs')
const { canonicalCrops, dimensions } = require('./images.cjs')
const { presentationSource } = require('./presentation.cjs')

const pickerHash = 'a6833ff7e68d8b1572987079ddb82924bc9c148ff1fb9826134a4ccdce020d3d'
class AnnotationController {
  constructor({ window, context, generation, target, session }) {
    this.window = window
    this.context = context
    this.generation = generation
    this.target = target
    this.session = session
    this.capture = null
    this.captureCount = 0
    this.loadedGeneration = null
    this.activation = null
    this.lane = new AnnotationRequestLane({ generation, cleanup: async () => {
      if (this.activation) await this.activation.catch(() => {})
      if (this.documentDeparture) await this.documentDeparture
      else if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        const result = await this.world('window.__CNC_ANNOTATION_CONTROL__?.stop() ?? ({restored:true})')
        if (result?.restored !== true) throw new Error('ANNOTATION_RESTORE_UNCONFIRMED')
      }
      this.capture = null
    } })
  }
  world(code) { return this.window.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code }]) }
  async privateContent() {
    try { await fs.access(path.join(this.context.profile, 'codex-auth/auth.json')) }
    catch (error) { if (error.code === 'ENOENT') return; throw error }
    throw new Error('ANNOTATION_SESSION_NOT_FRESH')
  }
  async prepare(request) {
    this.lane.assertCurrent(request)
    const generation = this.generation()
    if (this.loadedGeneration === generation) return
    const file = path.join(this.context.repository, 'node_modules/pi-annotate/chrome-extension/content.js')
    const source = await fs.readFile(file, 'utf8')
    this.lane.assertCurrent(request)
    if (createHash('sha256').update(source).digest('hex') !== pickerHash) throw new Error('ANNOTATION_PICKER_CHANGED')
    let catalog
    try { catalog = JSON.parse(await fs.readFile(path.join(__dirname, 'synthetic-states.json'), 'utf8')) }
    catch { throw new Error('ANNOTATION_CATALOG_REFUSED') }
    this.lane.assertCurrent(request)
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) || catalog.version !== 1 || !Array.isArray(catalog.states) || !catalog.states.length || catalog.states.length > 256
      || catalog.states.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
      || !Array.isArray(catalog.controls) || !catalog.controls.length || catalog.controls.length > 256
      || catalog.controls.some(value => typeof value !== 'string' || !value.trim() || value.length > 512)) throw new Error('ANNOTATION_CATALOG_REFUSED')
    const policy = await fs.readFile(path.join(__dirname, 'content-policy.js'), 'utf8')
    const renderer = await fs.readFile(path.join(__dirname, 'renderer.js'), 'utf8')
    this.lane.assertCurrent(request)
    await this.world(`if (!window.__CNC_ANNOTATION_POLICY_CONTEXT__) Object.defineProperty(window, '__CNC_ANNOTATION_POLICY_CONTEXT__', { value: Object.freeze(${JSON.stringify({ home: this.context.home })}), writable: false, configurable: false }); true`)
    this.lane.assertCurrent(request)
    await this.world(`if (!window.__CNC_ANNOTATION_STATE_CATALOG__) Object.defineProperty(window, '__CNC_ANNOTATION_STATE_CATALOG__', { value: Object.freeze(${JSON.stringify(catalog)}), writable: false, configurable: false }); true`)
    this.lane.assertCurrent(request)
    await this.world(policy)
    this.lane.assertCurrent(request)
    await this.world(renderer)
    this.lane.assertCurrent(request)
    await this.world(source)
    this.lane.assertCurrent(request)
    await this.world(await presentationSource(this.context.repository))
    this.lane.assertCurrent(request)
    this.loadedGeneration = generation
  }
  async start(command) {
    const request = this.lane.begin(command)
    const result = request.result.then(value => ({ value }), error => ({ error }))
    this.capture = null
    this.captureCount = 0
    this.activation = this.lane.work(command.request, async () => {
      try {
        await this.privateContent()
        this.lane.assertCurrent(command.request)
        await this.prepare(command.request)
        this.lane.assertCurrent(command.request)
        await this.world(`window.__CNC_ANNOTATION_CONTROL__.start(${JSON.stringify({ request: command.request, generation: command.generation, mode: command.mode })})`)
      } catch (error) {
        // Revoke now, but do not await cleanup that must join this activation.
        void this.lane.cancel(command.request, 'ANNOTATION_ACTIVATION_REFUSED').catch(() => {})
        throw error
      }
    })
    await this.activation.catch(() => {})
    const outcome = await result
    if (outcome.error) throw outcome.error
    return outcome.value
  }
  async check(packet, afterSubmission = false) {
    this.lane.assertCurrent(packet.request)
    if (packet.generation !== this.generation()) throw new Error('ANNOTATION_STALE_GENERATION')
    await this.privateContent()
    const state = await this.world(afterSubmission ? 'window.__CNC_ANNOTATION_CONTROL__.verify()' : 'window.__CNC_ANNOTATION_CONTROL__.gate()')
    if (state.revision !== packet.revision) throw new Error('ANNOTATION_CONTENT_CHANGED')
    if (!afterSubmission && JSON.stringify(state.viewport) !== JSON.stringify(packet.viewport)) throw new Error('ANNOTATION_STALE_GEOMETRY')
    this.lane.assertCurrent(packet.request)
  }
  async receive(packet) {
    if (packet.kind === 'cancel') {
      if (packet.generation !== this.generation()) throw new Error('ANNOTATION_STALE_GENERATION')
      await this.lane.cancel(packet.request)
      return { accepted: true }
    }
    try {
      await this.check(packet)
      if (packet.kind === 'capture') {
        return await this.lane.work(packet.request, async () => {
          if (this.capture) throw new Error('ANNOTATION_DUPLICATE_CAPTURE')
          const image = await this.window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: false })
          await this.check(packet)
          const bytes = image.toPNG(), size = dimensions(bytes)
          if (size.width !== Math.round(packet.viewport.width * packet.viewport.dpr)
            || size.height !== Math.round(packet.viewport.height * packet.viewport.dpr)) throw new Error('ANNOTATION_CAPTURE_SCALE')
          this.capture = { bytes, revision: packet.revision, viewport: packet.viewport }
          this.captureCount += 1
          return { dataUrl: 'data:image/png;base64,' + bytes.toString('base64') }
        })
      }
      if (packet.kind !== 'complete') throw new Error('ANNOTATION_OPERATION_REFUSED')
      const result = await this.lane.work(packet.request, async () => {
        if (this.capture && (this.capture.revision !== packet.revision
          || JSON.stringify(this.capture.viewport) !== JSON.stringify(packet.viewport))) throw new Error('ANNOTATION_STALE_GEOMETRY')
        const crops = canonicalCrops(nativeImage, this.capture?.bytes ?? null, packet)
        const saved = []
        for (const crop of crops) {
          await this.check(packet, true)
          const directory = path.join(this.context.root, 'captures'), stat = await fs.lstat(directory)
          if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error('ANNOTATION_EVIDENCE_REFUSED')
          const file = path.join(directory, randomUUID() + '.png')
          await fs.appendFile(path.join(this.context.root, 'capture-ledger.jsonl'), JSON.stringify({ path: file, index: crop.index, state: 'pending' }) + '\n', { mode: 0o600 })
          this.lane.assertCurrent(packet.request)
          const handle = await fs.open(file, 'wx', 0o600)
          try { await handle.writeFile(crop.bytes); await handle.sync() }
          finally { await handle.close() }
          // A file committed during cancellation remains identified but is not delivered.
          saved.push({ index: crop.index, path: file, sha256: crop.sha256, ...crop.dimensions })
          await fs.appendFile(path.join(this.context.root, 'capture-ledger.jsonl'), JSON.stringify(saved[saved.length - 1]) + '\n', { mode: 0o600 })
          this.lane.assertCurrent(packet.request)
          const actual = await fs.readFile(file)
          if (createHash('sha256').update(actual).digest('hex') !== crop.sha256) throw new Error('ANNOTATION_EVIDENCE_REFUSED')
        }
        await this.check(packet, true)
        return { version: 1, target: this.target, session: this.session, request: packet.request, generation: packet.generation,
          viewport: packet.viewport, selections: packet.selections, images: saved, captureCount: this.captureCount }
      })
      await this.lane.complete(packet.request, result)
      return { accepted: true }
    } catch (error) {
      // Release the renderer's failed IPC call so its submit continuation can drain.
      // The lane retains ownership until that continuation and cleanup settle.
      void this.lane.cancel(packet.request, 'ANNOTATION_CAPTURE_REFUSED').catch(() => {})
      throw error
    }
  }
  cancel(command) {
    if (command.generation !== this.generation()) return Promise.reject(new Error('ANNOTATION_STALE_GENERATION'))
    return this.lane.cancel(command.cancelFor)
  }
  retireNavigation() {
    if (!this.documentDeparture) {
      const contents = this.window.webContents
      this.documentDeparture = new Promise((resolve, reject) => {
        const clear = () => {
          contents.removeListener('did-navigate', committed)
          contents.removeListener('destroyed', committed)
          contents.removeListener('did-fail-load', failed)
        }
        const committed = () => { clear(); resolve() }
        const failed = (_event, _code, _description, _url, isMainFrame) => {
          if (!isMainFrame) return
          clear(); reject(new Error('ANNOTATION_DOCUMENT_DEPARTURE_UNCONFIRMED'))
        }
        contents.once('did-navigate', committed)
        contents.once('destroyed', committed)
        contents.on('did-fail-load', failed)
      })
      // Retain an observed rejection even when no request owns the old document.
      void this.documentDeparture.catch(() => {})
    }
    return this.retire()
  }
  retire() { return this.lane.invalidate() }
}
module.exports = { AnnotationController }
