import { expect, test } from '@playwright/test'
import { readFile, lstat, access } from 'node:fs/promises'
import * as fileSystem from 'node:fs'
import * as filePath from 'node:path'
import * as fileUrl from 'node:url'
import { runInNewContext } from 'node:vm'
import { createOwnedAnnotationLaunch } from '../scripts/electron-annotations/launch.mjs'

test('owned launcher has private portless control and preserves the ordinary page authority', async () => {
  test.skip(process.platform !== 'darwin', 'The owned launcher currently admits macOS only.')
  test.setTimeout(45_000)
  const launch = await createOwnedAnnotationLaunch({ session: 'synthetic-launch-test' })
  try {
    expect(launch.ready).toMatchObject({
      phase: 'idle', generation: 1, hidden: true, synthetic: true,
      permissions: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      appWorld: { bridge: 'undefined', node: 'undefined' },
      isolatedStatus: { phase: 'idle', generation: 1, hidden: true },
      debug: { renderer: false, inspector: false },
    })
    expect(await launch.status()).toMatchObject({ phase: 'idle', generation: 1, hidden: true })
    expect(launch.retired).toBe(false)
    expect(launch.ready.target).toBe(launch.target)
    expect(launch.ready.isolatedStatus.target).toBe(launch.target)
    expect(JSON.parse(await readFile(`${launch.root}/launch.json`, 'utf8'))).toMatchObject({
      version: 1, session: 'synthetic-launch-test', ready: { synthetic: true, hidden: true },
    })
    expect((await lstat(launch.profile)).mode & 0o777).toBe(0o700)
    expect((await lstat(`${launch.root}/launch.json`)).mode & 0o777).toBe(0o600)
    expect(await readFile(`${launch.home}/Synthetic.mpr`, 'utf8')).toBe('SYNTHETIC_PROJECT_UNCHANGED')
    expect(await readFile(`${launch.home}/.pi/agent/auth.json`, 'utf8')).toBe('SYNTHETIC_ORDINARY_PI_UNCHANGED')
    const abort = new AbortController()
    const aborted = launch.annotate({ mode: 'none', timeoutMs: 5000, signal: abort.signal }).catch((error: Error) => error.message)
    abort.abort()
    expect(await aborted).toBe('ANNOTATION_REQUEST_FAILED')
    expect((await launch.status()).phase).toBe('idle')
    const cancelled = launch.annotate({ mode: 'none', timeoutMs: 5000 }).catch((error: Error) => error.message)
    await expect.poll(async () => (await launch.status()).phase).toBe('active')
    await expect(launch.annotate({mode: 'none'})).rejects.toThrow('ANNOTATION_TARGET_BUSY')
    expect(await launch.cancel()).toEqual({ phase: 'cancelled' })
    expect(await cancelled).toBe('ANNOTATION_REQUEST_FAILED')
    expect((await launch.status()).phase).toBe('idle')
    const expired = launch.annotate({ mode: 'none', timeoutMs: 1000 }).catch((error: Error) => error.message)
    expect(await expired).toBe('ANNOTATION_REQUEST_FAILED')
    expect((await launch.status()).phase).toBe('idle')
    const closing = launch.annotate({ mode: 'none', timeoutMs: 5000 }).catch((error: Error) => error.message)
    await expect.poll(async () => (await launch.status()).phase).toBe('active')
    await launch.close()
    expect(launch.retired).toBe(true)
    await expect(launch.annotate({mode:'none'})).rejects.toThrow('ANNOTATION_TARGET_RETIRED')
    expect(await closing).toMatch(/^ANNOTATION_(REQUEST_FAILED|TARGET_CLOSED)$/)
  } finally {
    expect(await launch.close()).toEqual({ code: 0, signal: null, closeObserved: true, spawnFailed: false, terminationRequested: false })
  }
  expect(JSON.parse(await readFile(`${launch.root}/closure.json`, 'utf8'))).toMatchObject({ normal: true, retained: false })
  await expect(access(launch.home)).rejects.toMatchObject({code: 'ENOENT'})
  await expect(access(launch.profile)).rejects.toMatchObject({code: 'ENOENT'})
  expect((await lstat(launch.captures)).isDirectory()).toBe(true)
  expect((await lstat(launch.captures)).mode & 0o777).toBe(0o700)
})

test('launcher refuses caller paths and bootstrap refuses packaged operation before path access', async () => {
  await expect(createOwnedAnnotationLaunch({ session: '../private-session' })).rejects.toThrow('ANNOTATION_LAUNCH_REFUSED')
  await expect(createOwnedAnnotationLaunch({ session: 'valid', profile: '/private/owner' } as never)).rejects.toThrow('ANNOTATION_LAUNCH_REFUSED')
  const source = await readFile('scripts/electron-annotations/bootstrap.cjs', 'utf8')
  const exports: { verifySyntheticEnvironment?: () => unknown } = {}
  const module = { exports }
  runInNewContext(source, {
    module,
    __dirname: `${process.cwd()}/scripts/electron-annotations`,
    process: { platform: 'darwin', env: {} },
    require: (name: string) => {
      switch (name) {
        case 'electron': return { app: { isPackaged: true } }
        case 'node:fs': return fileSystem
        case 'node:path': return filePath
        case 'node:url': return fileUrl
        default: throw new Error('PROOF_MODULE_REFUSED')
      }
    },
  })
  expect(module.exports.verifySyntheticEnvironment).toBeDefined()
  expect(() => module.exports.verifySyntheticEnvironment!()).toThrow('ANNOTATION_PLATFORM_REFUSED')
})
