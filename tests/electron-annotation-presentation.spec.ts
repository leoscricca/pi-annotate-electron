import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { createPicker } = require('../scripts/electron-development-ui/picker.cjs')

async function start(page: Page) {
  await page.setContent(`<style>${await readFile('design/openchamber/tokens.css', 'utf8')}</style>
    <main style="padding:80px;color:var(--surface-foreground);background:var(--surface-background)">
      <button id="target">Connect Codex</button><button id="second" style="margin-left:400px">Settings</button>
      <textarea id="draft">Existing product draft</textarea>
    </main>`)
  await page.evaluate(() => {
    document.body.style.cursor = 'help'
    document.getElementById('draft')!.focus()
    let select: (point: { x: number; y: number; shiftKey: boolean }) => void
    const route = (event: MouseEvent) => {
      if ((event.target as Element).closest('#pi-panel, .pi-note-card, #pi-markers')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      select({ x: event.clientX, y: event.clientY, shiftKey: event.shiftKey })
    }
    ;(window as any).__CNC_DEV_UI__ = {
      guard(active: boolean) { if (active) document.addEventListener('click', route, true); else document.removeEventListener('click', route, true) },
      onHover() {}, onWheel() {}, onSelect(callback: typeof select) { select = callback }, onEscape() {}, inputState() { return {} },
      post(_connection: string, packet: unknown) { return (window as any).annotationPost(packet) },
    }
  })
  const events: any[] = []
  const picker = createPicker({
    contents: { isDestroyed: () => false, executeJavaScriptInIsolatedWorld: (_world: number, scripts: { code: string }[]) => page.evaluate(code => (0, eval)(code), scripts[0]!.code) },
    binding: { session: 'presentation-session', instance: 'fixture', window: 'main', connection: 'presentation-connection', generation: 1 },
    emit: (value: unknown) => events.push(value), isCurrent: () => true,
    onRevoked: () => { throw new Error('Unexpected presentation cleanup failure') },
    repositoryRoot: resolve('.'), images: {},
  })
  await page.exposeFunction('annotationPost', (packet: unknown) => picker.receive(packet))
  const before = await page.locator('#target').boundingBox()
  await picker.start('presentation-request', 'none')
  return { picker, events, before }
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [980, 1280, 1440]) {
    test(`compact toolbar and note delivery preserve the app at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const { picker, events, before } = await start(page)
      try {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
        await expect(page.getByText('Electron Annotate', { exact: true })).toBeVisible()
        const toolbar = await page.locator('#pi-panel').boundingBox()
        expect(toolbar!.height).toBeLessThanOrEqual(60)
        expect(toolbar!.width).toBeLessThan(600)
        expect(toolbar!.y + toolbar!.height).toBe(884)
        await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
        await page.locator('#target').hover()
        await page.locator('#target').click()
        const note = page.locator('.pi-note-card')
        await expect(note.getByRole('textbox', { name: 'Feedback' })).toBeVisible()
        await expect(note.getByRole('textbox', { name: 'Feedback' })).toBeFocused()
        await expect(page.locator('#pi-tooltip')).toBeHidden({ timeout: 500 })
        await note.getByRole('textbox', { name: 'Feedback' }).fill('Reduce the button padding.')
        await expect(note.getByRole('combobox', { name: 'Screenshot' })).toHaveValue('none')
        await note.getByRole('combobox', { name: 'Screenshot' }).selectOption('crop')
        await expect(page.locator('#pi-ss-each')).toHaveClass(/active/)
        await note.getByRole('combobox', { name: 'Screenshot' }).selectOption('none')
        expect(await page.locator('#target').boundingBox()).toEqual(before)
        const color = await note.evaluate(node => getComputedStyle(node).backgroundColor)
        expect(color).toBe(theme === 'dark' ? 'rgb(27, 25, 24)' : 'rgb(243, 242, 240)')
        const label = note.locator('.pi-note-header')
        const box = await label.boundingBox()
        await page.mouse.move(box!.x + 50, box!.y + 12)
        await page.mouse.down()
        await page.mouse.move(box!.x + 90, box!.y + 50)
        await page.mouse.up()
        expect((await label.boundingBox())!.x).toBeGreaterThan(box!.x)
        await page.getByRole('button', { name: 'Send', exact: true }).click()
        await expect(page.locator('#pi-panel')).toHaveCount(0)
        await expect.poll(() => events.length).toBe(1)
        expect(events[0]).toMatchObject({ kind: 'annotation', outcome: 'submitted', mode: 'none', notes: [{ name: 'Connect Codex', comment: 'Reduce the button padding.' }] })
        expect(events[0].notes[0]).not.toHaveProperty('image')
        await expect(page.locator('#draft')).toHaveValue('Existing product draft')
        await expect(page.locator('#draft')).toBeFocused()
        expect(await page.locator('body').evaluate(node => node.style.cursor)).toBe('help')
      } finally { await picker.close() }
    })
  }
}

test('multi-selection and X cancellation retain the same picker connection', async ({ page }) => {
  const { picker, events } = await start(page)
  try {
    await page.getByRole('button', { name: 'Select multiple elements' }).click()
    for (const id of ['target', 'second']) { await page.locator('#' + id).hover(); await page.locator('#' + id).click() }
    await expect(page.locator('.pi-note-card')).toHaveCount(2)
    await expect(page.locator('#pi-count')).toHaveText('2 selected')
    await page.getByRole('button', { name: 'Cancel annotation' }).click()
    await expect(page.locator('#pi-panel')).toHaveCount(0)
    await expect.poll(() => events.length).toBe(1)
    expect(events[0]).toMatchObject({ outcome: 'cancelled', notes: [] })
    await picker.start('presentation-resumed', 'none')
    await expect(page.getByText('Electron Annotate', { exact: true })).toBeVisible()
    await expect(page.locator('#draft')).toHaveValue('Existing product draft')
  } finally { await picker.close() }
})

test('a growing note stays above the toolbar near the viewport edge', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 720 })
  const { picker } = await start(page)
  try {
    await page.locator('#target').hover()
    await page.locator('#target').click()
    const card = page.locator('.pi-note-card')
    const box = (await card.locator('.pi-note-header').boundingBox())!
    await page.mouse.move(box.x + 3, box.y + 3)
    await page.mouse.down()
    await page.mouse.move(box.x + 3, 650)
    await page.mouse.up()
    await card.getByRole('textbox', { name: 'Feedback' }).fill('A longer note about the selected element.\n'.repeat(12))
    await expect.poll(async () => {
      const note = (await card.boundingBox())!, toolbar = (await page.locator('#pi-panel').boundingBox())!
      return note.y + note.height <= toolbar.y - 8
    }).toBe(true)
    await expect(page.locator('#pi-markers .pi-marker-outline')).toBeVisible()
    await expect(page.locator('.pi-connectors')).toBeHidden()
  } finally { await picker.close() }
})
