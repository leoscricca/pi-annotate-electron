import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { cleanupClosedSyntheticProfile } from './cleanup.mjs'

const repository = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const runtime = join(repository, 'scripts/electron-annotations/runtime.cjs')
const require = createRequire(import.meta.url)
const wait = ms => new Promise(resolvePromise => { const timer = setTimeout(() => resolvePromise(null), ms); timer.unref() })
async function json(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) }
  catch { throw new Error('ANNOTATION_PREREQUISITE_REFUSED') }
}

export async function createOwnedAnnotationLaunch(options) {
  if (process.platform !== 'darwin' || !options || Object.keys(options).some(key => !['session', 'foregroundApproved'].includes(key))
    || typeof options.session !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(options.session)
    || options.foregroundApproved !== undefined && typeof options.foregroundApproved !== 'boolean') {
    throw new Error('ANNOTATION_LAUNCH_REFUSED')
  }
  if ((await json(require.resolve('electron/package.json'))).version !== '44.9.3') {
    throw new Error('ANNOTATION_PREREQUISITE_REFUSED')
  }
  const electron = require('electron')
  const root = await realpath(await mkdtemp('/tmp/cnc-codex-desktop-'))
  await chmod(root, 0o700)
  const home = join(root, 'home'), profile = join(root, 'profile'), temporary = join(root, 'tmp'), captures = join(root, 'captures')
  for (const path of [home, profile, temporary, captures, join(home, '.pi/agent')]) await mkdir(path, { recursive: true, mode: 0o700 })
  await writeFile(join(profile, 'conversation-fixture.json'), JSON.stringify({ version: 1, suite: 'synthetic-codex-v1', home, profile }), { flag: 'wx', mode: 0o600 })
  await writeFile(join(home, 'Synthetic.mpr'), 'SYNTHETIC_PROJECT_UNCHANGED', { flag: 'wx', mode: 0o600 })
  await writeFile(join(home, '.pi/agent/auth.json'), 'SYNTHETIC_ORDINARY_PI_UNCHANGED', { flag: 'wx', mode: 0o600 })
  const token = randomBytes(32).toString('hex'), target = randomUUID(), session = options.session
  const log = await open(join(root, 'launcher.log'), 'wx', 0o600)
  const environment = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, USERPROFILE: home,
    XDG_CONFIG_HOME: profile, APPDATA: profile, LOCALAPPDATA: profile, TMPDIR: temporary,
    CNC_MENDIX_E2E_HOME: home, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' }
  const child = spawn(electron, [runtime, `--user-data-dir=${profile}`, '--e2e-hidden', '--e2e-conversation-fixture'],
    { cwd: repository, env: environment, stdio: ['ignore', log.fd, log.fd, 'ipc'], serialization: 'json' })
  let terminal, spawnFailed = false, stopRequested = false, readySettled = false, retired = false
  let resolveReady, rejectReady
  const requests = new Map()
  const ready = new Promise((resolvePromise, rejectPromise) => { resolveReady = resolvePromise; rejectReady = rejectPromise })
  const startupDeadline = setTimeout(() => { if (!readySettled) rejectReady(new Error('ANNOTATION_STARTUP_UNCONFIRMED')) }, 15_000)
  const closed = new Promise(resolvePromise => {
    child.once('error', () => { spawnFailed = true; if (!readySettled) rejectReady(new Error('ANNOTATION_SPAWN_FAILED')) })
    child.once('close', (code, signal) => {
      retired = true
      terminal = { code, signal, closeObserved: true, spawnFailed, terminationRequested: stopRequested }
      clearTimeout(startupDeadline)
      if (!readySettled) rejectReady(new Error('ANNOTATION_STARTUP_CLOSED'))
      for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error('ANNOTATION_TARGET_CLOSED')) }
      requests.clear()
      resolvePromise(terminal)
    })
  })
  child.on('message', value => {
    if (!value || value.version !== 1 || value.target !== target) return
    if (value.kind === 'retired') { retired = true; return }
    if (value.kind === 'ready' && !readySettled) { readySettled = true; clearTimeout(startupDeadline); resolveReady(value.value); return }
    if (value.kind === 'error' && !readySettled) { readySettled = true; clearTimeout(startupDeadline); rejectReady(new Error(value.code)); return }
    const pending = requests.get(value.request)
    if (!pending) return
    clearTimeout(pending.timer); requests.delete(value.request)
    if (value.kind === 'reply') pending.resolve(value.value)
    else pending.reject(new Error(value.code || 'ANNOTATION_REPLY_REFUSED'))
  })
  child.once('spawn', () => {
    child.send({ version: 1, kind: 'boot', session, target, token, foreground: options.foregroundApproved === true }, error => {
      if (error && !readySettled) rejectReady(new Error('ANNOTATION_BOOT_UNCONFIRMED'))
    })
  })
  await log.close()
  async function request(kind, payload = {}, fixedId) {
    if (terminal || !child.connected) throw new Error('ANNOTATION_TARGET_CLOSED')
    const id = fixedId ?? randomUUID()
    const promise = new Promise((resolvePromise, rejectPromise) => {
      const timer = kind === 'start' ? undefined : setTimeout(() => { requests.delete(id); rejectPromise(new Error('ANNOTATION_REPLY_UNCONFIRMED')) }, 10_000)
      requests.set(id, { resolve: resolvePromise, reject: rejectPromise, timer })
      child.send({ version: 1, kind, session, target, token, request: id, ...payload }, error => {
        if (!error) return
        const pending = requests.get(id)
        if (pending) { clearTimeout(pending.timer); requests.delete(id); pending.reject(new Error('ANNOTATION_TRANSPORT_CLOSED')) }
      })
    })
    return promise
  }
  let activeAnnotation = null
  let closeOperation
  const handle = {
    root, home, profile, captures, target, session,
    get retired() { return retired },
    status: () => request('status'),
    async annotate({ mode = 'none', timeoutMs = 300000, signal } = {}) {
      if (retired) throw new Error('ANNOTATION_TARGET_RETIRED')
      if (activeAnnotation) throw new Error('ANNOTATION_TARGET_BUSY')
      if (signal?.aborted) throw new Error('ANNOTATION_CANCELLED')
      const id = randomUUID(), generation = handle.ready.generation
      activeAnnotation = id
      const cancel = () => { void request('cancel', { cancelFor: id, generation }).catch(() => {}) }
      signal?.addEventListener('abort', cancel, { once: true })
      try { return await request('start', { mode, generation, timeoutMs }, id) }
      finally { signal?.removeEventListener('abort', cancel); activeAnnotation = null }
    },
    cancel: () => activeAnnotation ? request('cancel', { cancelFor: activeAnnotation, generation: handle.ready.generation }) : Promise.resolve({ phase: 'not-current' }),
    close() {
      retired = true
      return closeOperation ??= (async () => {
      if (!terminal && child.connected) {
        try { await request('shutdown') }
        catch { /* A close observation, not the acknowledgement, determines completion. */ }
      }
      let result = terminal || await Promise.race([closed, wait(10_000)])
      if (!result && !stopRequested && child.exitCode === null && child.signalCode === null) {
        stopRequested = true
        child.kill('SIGTERM')
        result = await Promise.race([closed, wait(10_000)])
      }
      const normal = result && result.code === 0 && result.signal === null && !result.spawnFailed && !stopRequested
      await writeFile(join(root, 'closure.json'), JSON.stringify({ terminal: result, normal, retained: !normal }), { mode: 0o600 })
      if (!normal) throw new Error('ANNOTATION_CLEANUP_UNCONFIRMED; evidence retained at ' + root)
      await cleanupClosedSyntheticProfile(root, result)
      return result
      })()
    },
  }
  try {
    handle.ready = await ready
    await writeFile(join(root, 'launch.json'), JSON.stringify({ version: 1, target, session, pid: child.pid, ready: handle.ready }), { flag: 'wx', mode: 0o600 })
    return handle
  } catch (error) {
    try { await handle.close() }
    catch { throw new Error('ANNOTATION_STARTUP_AND_CLEANUP_UNCONFIRMED; evidence retained at ' + root) }
    throw error
  }
}
