import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createOfflineAnnotationSession } from './fixtures/electron-development-ui-sdk'

test.skip(process.platform !== 'darwin', 'This real SDK connection check uses the macOS private registry.')

test('real offline Pi SDK registers the owner command and UI tool without live credentials or remote inference', async () => {
  const root = await fs.mkdtemp('/tmp/cui-sdk-')
  await fs.chmod(root, 0o700)
  const previous = process.env.TMPDIR
  process.env.TMPDIR = root
  await fs.mkdir(path.join(root, `cui-${process.getuid!()}`), { mode: 0o700 })
  let sdk: Awaited<ReturnType<typeof createOfflineAnnotationSession>> | undefined
  try {
    sdk = await createOfflineAnnotationSession(root)
    expect(sdk.session.getActiveToolNames().sort()).toEqual(['annotate_electron', 'electron_ui'])
    expect(sdk.session.extensionRunner!.hasUI()).toBe(true)
    const result = await sdk.run('status')
    expect(result.content[0]).toMatchObject({ type: 'text', text: '{"state":"disconnected","message":"The owner must select a window with /annotate-electron connect."}' })
    await sdk.session.prompt('/annotate-electron connect')
    expect(sdk.notices).toEqual([{ type: 'info', message: 'No compatible development annotation window is available. Older app instances require a later manual restart after you save your work. No app was started or restarted.' }])
    expect(sdk.observation.calls).toBe(2)
    sdk.queueText('Synthetic offline transport received. No source changes.')
    await sdk.session.prompt('Synthetic local-only transport probe')
    expect(sdk.observation.calls).toBe(3)
    expect(JSON.stringify(sdk.session.messages)).toContain('Synthetic offline transport received. No source changes.')
    expect(sdk.annotationMessages()).toEqual([])
    expect(sdk.errors).toEqual([])
  } finally {
    await sdk?.shutdown()
    if (previous === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previous
  }
})
