import type { ChildProcess } from 'node:child_process'

export interface TestChildExit {
  code: number | null
  signal: string | null
  timedOut: boolean
  closeObserved: boolean
  terminationRequested: boolean
  spawnFailed: boolean
}

/** Observe immediately after spawn, before any asynchronous receipt writes.
 * A deadline can terminate only this newly owned child; it never proves clean application teardown.
 * Keep the fixture root on every outcome. Never signal historical PIDs or process groups.
 */
export function observeTestChild(child: Pick<ChildProcess, 'once' | 'kill' | 'unref'>,
  timeoutMs = 45_000, terminationMs = 5_000): Promise<TestChildExit> {
  return new Promise(resolve => {
    let timedOut = false
    let terminationRequested = false
    let spawnFailed = false
    let settled = false
    let termination: ReturnType<typeof setTimeout> | undefined
    const finish = (code: number | null, signal: string | null, closeObserved: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      if (termination) clearTimeout(termination)
      resolve({ code, signal, timedOut, closeObserved, terminationRequested, spawnFailed })
    }
    child.once('error', () => { spawnFailed = true })
    child.once('close', (code, signal) => finish(code, signal, true))
    const deadline = setTimeout(() => {
      timedOut = true
      // Arm before kill: controlled test children may close synchronously.
      termination = setTimeout(() => { child.unref(); finish(null, null, false) }, terminationMs)
      try { terminationRequested = child.kill('SIGTERM') } catch { /* still require close, otherwise retain UNKNOWN */ }
    }, timeoutMs)
  })
}
