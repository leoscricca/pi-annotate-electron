import { expect, test } from '@playwright/test'
import { createServer, createConnection } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, writeFile, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { installAnnotationAdapter } from '../scripts/electron-annotations/adapter.mjs'
import { formatPageAnnotation } from '../scripts/electron-annotations/feedback.mjs'

test('Electron delivery leaves an existing private fake Chrome connection and queue intact', async () => {
  const root = await mkdtemp('/tmp/cnc-annotation-route-')
  const socket = join(root, 'chrome.sock'), queue = join(root, 'chrome-queue.json'), token = join(root, 'chrome-token')
  await writeFile(queue, '{"pending":"SYNTHETIC_CHROME_NOTE"}\n', { mode: 0o600 })
  await writeFile(token, 'SYNTHETIC_CHROME_TOKEN', { mode: 0o600 })
  let connections = 0
  const server = createServer(client => {
    connections += 1
    client.on('data', () => client.write('SYNTHETIC_CHROME_CONNECTED'))
  })
  server.listen(socket)
  await once(server, 'listening')
  const client = createConnection(socket)
  await once(client, 'connect')
  async function ping() {
    const response = once(client, 'data')
    client.write('SYNTHETIC_PING')
    return (await response)[0].toString()
  }
  const messages: unknown[] = []
  let command: any
  const adapter = installAnnotationAdapter({
    registerTool: () => {}, registerCommand: (_name: string, value: unknown) => { command = value }, on: () => {},
    sendUserMessage: (message: unknown) => messages.push(message),
  }, { schema: {}, state: { epoch: 0, slots: new Map() },
    content: async (result: any) => [{ type: 'text', text: formatPageAnnotation(result) }],
    createLaunch: async ({ session }: { session: string }) => ({ target: session + '-target', retired: false, captures: root,
      annotate: async () => ({ target: session + '-target', session, request: session + '-request', generation: 1,
        viewport: { width: 1280, height: 800, dpr: 1, scrollX: 0, scrollY: 0 },
        selections: [{ selector: '#settings', tag: 'button', role: 'button', name: 'Settings',
          comment: 'Reduce the Settings button padding', bounds: { x: 20, y: 30, width: 100, height: 40 }, styles: {} }], images: [] }),
      close: async () => {}, cancel: async () => {}, status: async () => ({ phase: 'idle' }) }),
  })
  const ctx = (id: string) => ({ hasUI: true, sessionManager: { getSessionId: () => id }, ui: { confirm: async () => true, notify: () => {} } })
  try {
    expect(await ping()).toBe('SYNTHETIC_CHROME_CONNECTED')
    await adapter.perform(ctx('pane-A'), 'open')
    await adapter.perform(ctx('pane-B'), 'open')
    await command.handler('none', ctx('pane-A'))
    await command.handler('none', ctx('pane-B'))
    expect(messages).toHaveLength(2)
    expect(JSON.stringify(messages[0])).toContain('pane-A-target')
    expect(JSON.stringify(messages[0])).not.toContain('pane-B-target')
    expect(JSON.stringify(messages[1])).toContain('pane-B-target')
    expect(await ping()).toBe('SYNTHETIC_CHROME_CONNECTED')
    expect(connections).toBe(1)
    expect(await readFile(queue, 'utf8')).toBe('{"pending":"SYNTHETIC_CHROME_NOTE"}\n')
    expect(await readFile(token, 'utf8')).toBe('SYNTHETIC_CHROME_TOKEN')
    expect((await stat(token)).mode & 0o777).toBe(0o600)
  } finally {
    await adapter.perform(ctx('pane-A'), 'close')
    await adapter.perform(ctx('pane-B'), 'close')
    const closed = once(client, 'close')
    client.destroy()
    await closed
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
