import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { createPicker } = require('../scripts/electron-development-ui/picker.cjs')

async function start(page: Page, mode: 'none' | 'crop' = 'none', options: { appCss?: string; random?: number } = {}) {
  await page.setContent(`<style>${await readFile('design/openchamber/tokens.css', 'utf8')}${options.appCss ?? ''}</style>
    <main style="padding:80px;color:var(--surface-foreground);background:var(--surface-background)">
      <button id="target">Connect Codex</button><button id="second" style="margin-left:400px">Settings</button>
      <textarea id="draft">Existing product draft</textarea>
    </main>`)
  if (options.random !== undefined) await page.evaluate(value => { Math.random = () => value }, options.random)
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
  await picker.start('presentation-request', mode)
  return { picker, events, before }
}


test('Catppuccin Mocha controls use brand accents without recoloring the app', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const { picker } = await start(page)
  const style = (selector: string, property: string) => page.locator(selector).evaluate((node, key) => getComputedStyle(node).getPropertyValue(key), property)
  try {
    await expect.poll(() => style('.pi-cnc-tools', 'background-color')).toBe('rgb(30, 30, 46)')
    await expect.poll(() => style('#target', '--surface-background')).toBe('#120f0e')
    await expect.poll(() => style('.pi-cnc-select', 'color')).toBe('rgb(250, 179, 135)')
    await page.locator('#target').click()
    await expect.poll(() => style('#pi-submit', 'background-color')).toBe('rgb(250, 179, 135)')
    await page.locator('.pi-note-screenshot').click()
    await expect.poll(() => style('.pi-note-screenshot', 'color')).toBe('rgb(137, 180, 250)')
    await page.getByRole('button', { name: 'Show element details', exact: true }).click()
    await expect.poll(() => style('.pi-cnc-details-toggle', 'color')).toBe('rgb(203, 166, 247)')
    await expect.poll(() => style('#target', '--surface-background')).toBe('#120f0e')
  } finally { await picker.close() }
})

test('Latte follows an explicit light host and keeps note labels readable', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const { picker } = await start(page, 'none', { random: 0.999 })
  try {
    await page.evaluate(() => document.documentElement.dataset.theme = 'light')
    expect(await page.locator('.pi-cnc-tools').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(239, 241, 245)')
    await page.locator('#target').click()
    expect(await page.locator('.pi-note-card').evaluate(node => getComputedStyle(node).borderColor)).toBe('rgb(220, 138, 120)')
    expect(await page.locator('.pi-note-badge').evaluate(node => getComputedStyle(node).color)).toBe('rgb(76, 79, 105)')
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
    expect(await page.locator('.pi-note-card').evaluate(node => getComputedStyle(node).borderColor)).toBe('rgb(245, 224, 220)')
    expect(await page.locator('.pi-cnc-tools').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(30, 30, 46)')
  } finally { await picker.close() }
})

test('Latte note focus and screenshot captions stay readable across every accent', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { picker } = await start(page, 'none', { random: 0.999 })
  const ratios = { focus: [] as number[], caption: [] as number[], placeholder: [] as number[] }
  const luminance = (rgb: number[]) => rgb.slice(0,3).map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4 }).reduce((sum, value, index) => sum + value * [0.2126,0.7152,0.0722][index]!, 0)
  const contrast = (a: number[], b: number[]) => { const light = luminance(a), dark = luminance(b); return (Math.max(light,dark) + .05) / (Math.min(light,dark) + .05) }
  try {
    await page.evaluate(() => document.documentElement.dataset.theme = 'light')
    for (let i = 0; i < 14; i++) {
      await page.locator('#target').click()
      await page.locator('.pi-note-screenshot').click()
      await page.keyboard.press('Tab')
      const text = page.getByRole('textbox', { name: 'Feedback', exact: true })
      await text.focus()
      expect(await text.evaluate(node => node.matches(':focus-visible'))).toBe(true)
      const colors = await page.locator('.pi-note-card').evaluate(card => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d')!
        const pixel = (color: string) => { ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data] }
        const text = card.querySelector('textarea')!, caption = card.querySelector('.pi-note-screenshot')!
        return { background: pixel(getComputedStyle(card).backgroundColor), focus: pixel(getComputedStyle(text).outlineColor), caption: pixel(getComputedStyle(caption).color), placeholder: pixel(getComputedStyle(text,'::placeholder').color) }
      })
      for (const role of ['focus','caption','placeholder'] as const) ratios[role].push(contrast(colors[role],colors.background))
      await page.locator('#target').click()
    }
    expect.soft(Math.min(...ratios.focus)).toBeGreaterThanOrEqual(3)
    expect.soft(Math.min(...ratios.caption)).toBeGreaterThanOrEqual(4.5)
    expect.soft(Math.min(...ratios.placeholder)).toBeGreaterThanOrEqual(4.5)
  } finally { await picker.close() }
})

test('annotation accents use shuffled Catppuccin cycles and stay unique through reuse and history', async ({ browser }) => {
  const palette = ['#f5e0dc','#f2cdcd','#f5c2e7','#cba6f7','#f38ba8','#eba0ac','#fab387','#f9e2af','#a6e3a1','#94e2d5','#89dceb','#74c7ec','#89b4fa','#b4befe']
    .map(hex => `rgb(${[1,3,5].map(offset => parseInt(hex.slice(offset, offset + 2),16)).join(', ')})`)
  const sequences: string[][] = []
  for (const random of [0, 0.999]) {
    const page = await browser.newPage()
    await page.emulateMedia({ colorScheme: 'dark' })
    const { picker } = await start(page, 'none', { random })
    try {
      await page.evaluate(() => {
        for (let i = 0; i < 2; i++) {
          const node = document.createElement('button'); node.id = `color-${i}`; node.textContent = `Color target ${i}`
          node.style.cssText = `position:fixed;left:12px;top:${160 + i * 40}px`; document.body.append(node)
        }
      })
      await page.getByRole('button', { name: 'Hide annotations', exact: true }).click()
      const colors = () => page.locator('.pi-note-card').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderColor))
      for (const id of ['color-0','color-1']) await page.locator('#' + id).click()
      const initial = await colors(), cycle = [...initial]
      for (const value of initial) expect(palette).toContain(value)
      for (let i = 0; i < 17; i++) {
        await page.locator('#color-1').click(); await page.locator('#color-1').click()
        const current = await colors()
        expect(new Set(current).size).toBe(2)
        expect(current[0]).toBe(initial[0])
        expect(palette).toContain(current[1])
        cycle.push(current[1])
      }
      expect(new Set(cycle.slice(0, 14)).size).toBe(14)
      for (let i = 0; i < 34; i++) await page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
      expect(await colors()).toEqual(initial)
      sequences.push(cycle.slice(0, 14))
    } finally { await picker.close(); await page.close() }
  }
  expect(sequences[0]).not.toEqual(sequences[1])
})

test('ten simultaneous notes retain distinct colors after the cycle is reused', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const { picker } = await start(page, 'none', { random: 0.35 })
  try {
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        const node = document.createElement('button'); node.id = `many-${i}`; node.textContent = `Target ${i}`
        node.style.cssText = `position:fixed;left:12px;top:${150 + i * 32}px`; document.body.append(node)
      }
    })
    await page.getByRole('button', { name: 'Hide annotations', exact: true }).click()
    for (let i = 0; i < 10; i++) await page.locator(`#many-${i}`).click()
    const colors = () => page.locator('.pi-note-card').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderColor))
    const original = await colors()
    expect(new Set(original).size).toBe(10)
    for (let i = 0; i < 17; i++) {
      await page.locator('#many-9').click(); await page.locator('#many-9').click()
      const current = await colors()
      expect(new Set(current).size).toBe(10)
      expect(current.slice(0, 9)).toEqual(original.slice(0, 9))
    }
  } finally { await picker.close() }
})

test('icon buttons stay centered when the app adds margins to button icons', async ({ page }) => {
  const { picker } = await start(page, 'none', { appCss: 'button svg { margin-right:6px }' })
  try {
    for (const selector of ['.pi-cnc-select', '.pi-cnc-visibility', '#pi-submit']) {
      const control = (await page.locator(selector).boundingBox())!
      const icon = (await page.locator(selector + ' svg').boundingBox())!
      expect(Math.abs(icon.x + icon.width / 2 - control.x - control.width / 2)).toBeLessThan(.25)
      expect(Math.abs(icon.y + icon.height / 2 - control.y - control.height / 2)).toBeLessThan(.25)
    }
  } finally { await picker.close() }
})

test('empty Send keeps an opaque surface over app content', async ({ page }) => {
  const { picker } = await start(page)
  try {
    const send = page.getByRole('button', { name: 'Send annotations', exact: true })
    await expect(send).toBeDisabled()
    expect(await send.evaluate(node => getComputedStyle(node).opacity)).toBe('1')
  } finally { await picker.close() }
})

test('picker controls and notes render above app overlays and clean up their layers', async ({ page }) => {
  const { picker } = await start(page)
  try {
    await page.evaluate(() => { const node = document.createElement('div'); node.id = 'app-overlay'; node.style.cssText = 'position:fixed;inset:auto 0 0;height:180px;z-index:2147483647;background:salmon'; document.body.append(node) })
    const send = page.locator('#pi-submit')
    expect(await send.evaluate(node => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#pi-panel') !== null })).toBe(true)
    await page.locator('#target').click()
    const text = page.getByRole('textbox', { name: 'Feedback', exact: true })
    await text.click()
    await text.fill('Keep the picker above the app overlay.')
    await expect(text).toBeFocused()
    expect(await text.evaluate(node => { const r = node.getBoundingClientRect(); return !!document.elementFromPoint(r.x + 20, r.bottom - 8)?.closest('.pi-note-card') })).toBe(true)
    await page.getByRole('button', { name: 'Cancel annotation', exact: true }).click()
    await expect(page.locator('#pi-panel,.pi-notes-container,#pi-markers,[popover]')).toHaveCount(0)
    await expect(page.locator('#app-overlay')).toBeVisible()
    await expect(page.locator('#draft')).toBeFocused()
  } finally { await picker.close() }
})

test('dock drags from its corners, stays in the viewport, and leaves controls usable', async ({ page }) => {
  const { picker, events } = await start(page)
  try {
    const dock = page.locator('#pi-panel')
    const before = (await dock.boundingBox())!
    await page.mouse.move(before.x + 3, before.y + 3)
    await page.mouse.down()
    await page.mouse.move(before.x - 197, before.y - 297, { steps: 4 })
    await page.mouse.up()
    const moved = (await dock.boundingBox())!
    expect(moved.x).toBeCloseTo(before.x - 200, 0)
    expect(moved.y).toBeCloseTo(before.y - 300, 0)
    await page.mouse.move(moved.x + moved.width - 3, moved.y + moved.height - 3)
    await page.mouse.down()
    await page.mouse.move(2, 2)
    await page.mouse.up()
    const edge = (await dock.boundingBox())!
    expect(edge.x).toBeGreaterThanOrEqual(8)
    expect(edge.y).toBeGreaterThanOrEqual(8)
    await page.setViewportSize({ width: 390, height: 600 })
    await expect.poll(async () => { const box = (await dock.boundingBox())!; return box.x + box.width }).toBeLessThanOrEqual(382)
    await expect(page.locator('.pi-note-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'Select an element', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Select an element', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Cancel annotation', exact: true }).click()
    await expect.poll(() => events.length).toBe(1)
    expect(events[0].outcome).toBe('cancelled')
  } finally { await picker.close() }
})

test('selection colors match notes and markers and survive deletion and undo', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const { picker } = await start(page)
  try {
    for (const id of ['target', 'second']) { await page.locator('#' + id).hover(); await page.locator('#' + id).click() }
    const color = (selector: string) => page.locator(selector).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderColor))
    const outlines = await color('.pi-marker-outline')
    expect(new Set(outlines).size).toBe(2)
    expect(await color('.pi-note-card')).toEqual(outlines)
    const badgeColors = await page.locator('.pi-note-badge').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color))
    expect(badgeColors).toEqual(outlines)
    const fills = await page.locator('.pi-note-card').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))
    expect(new Set(fills).size).toBe(2)
    await page.locator('.pi-note-card').first().getByRole('button', { name: 'Delete annotation', exact: true }).click()
    expect(await color('.pi-marker-outline')).toEqual([outlines[1]])
    await page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    expect(await color('.pi-marker-outline')).toEqual(outlines)
    // A reselected element is a new annotation; it must not overwrite an older
    // annotation's saved color when a later undo restores that original card.
    await page.locator('.pi-note-card').nth(1).getByRole('button', { name: 'Delete annotation', exact: true }).click()
    await page.evaluate(() => { const node = document.createElement('button'); node.id = 'third'; node.textContent = 'Third control'; node.style.cssText = 'position:fixed;top:200px;left:80px'; document.body.append(node) })
    for (const id of ['third', 'second']) { await page.locator('#' + id).hover(); await page.locator('#' + id).click() }
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    expect(await color('.pi-marker-outline')).toEqual(outlines)
  } finally { await picker.close() }
})

for (const theme of ['dark', 'light'] as const) {
  for (const width of [980, 1280, 1440]) {
    test(`compact toolbar and note delivery preserve the app at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const { picker, events, before } = await start(page)
      try {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
        await expect(page.getByRole('toolbar', { name: 'Electron Annotate' })).toBeVisible()
        const toolbar = await page.locator('#pi-panel').boundingBox()
        expect(toolbar!.height).toBeLessThanOrEqual(60)
        expect(toolbar!.width).toBeLessThan(600)
        expect(toolbar!.y + toolbar!.height).toBe(884)
        await expect(page.getByRole('button', { name: 'Send annotations', exact: true })).toBeDisabled()
        await page.locator('#target').hover()
        await page.locator('#target').click()
        const note = page.locator('.pi-note-card')
        await expect(note.getByRole('textbox', { name: 'Feedback' })).toBeVisible()
        await expect(note.getByRole('textbox', { name: 'Feedback' })).toBeFocused()
        await expect(page.locator('#pi-tooltip')).toBeHidden({ timeout: 500 })
        await note.getByRole('textbox', { name: 'Feedback' }).fill('Reduce the button padding.')
        await expect(note.locator('.pi-note-screenshot')).toHaveAttribute('aria-pressed', 'false')
        await note.locator('.pi-note-screenshot').click()
        await expect(page.locator('#pi-ss-each')).toHaveClass(/active/)
        await note.locator('.pi-note-screenshot').click()
        expect(await page.locator('#target').boundingBox()).toEqual(before)
        const color = await note.evaluate(node => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')!
          const pixel = (value: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data] }
          return { tint: pixel(getComputedStyle(node).backgroundColor), accent: pixel(getComputedStyle(node).borderColor) }
        })
        const base = theme === 'dark' ? [30, 30, 46] : [239, 241, 245]
        expect(color.tint[3]).toBe(255)
        for (let channel = 0; channel < 3; channel++) expect(Math.abs(color.tint[channel]! - (base[channel]! * .94 + color.accent[channel]! * .06))).toBeLessThanOrEqual(1)
        const label = note.locator('.pi-note-header')
        const box = await label.boundingBox()
        await page.mouse.move(box!.x + 50, box!.y + 12)
        await page.mouse.down()
        await page.mouse.move(box!.x + 90, box!.y + 50)
        await page.mouse.up()
        expect((await label.boundingBox())!.x).toBeGreaterThan(box!.x)
        await page.getByRole('button', { name: 'Send annotations', exact: true }).click()
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

test('multi-note screenshot choices stay independent', async ({ page }) => {
  const { picker } = await start(page)
  try {
    await expect(page.getByRole('button', { name: 'Select an element', exact: true })).toHaveAttribute('aria-pressed', 'true')
    for (const id of ['target', 'second']) { await page.locator('#' + id).hover(); await page.locator('#' + id).click() }
    const notes = page.locator('.pi-note-card')
    await expect(notes).toHaveCount(2)
    const first = notes.nth(0).locator('.pi-note-screenshot')
    const second = notes.nth(1).locator('.pi-note-screenshot')
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await expect(second).toHaveAttribute('aria-pressed', 'false')
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(second).toHaveAttribute('aria-pressed', 'false')
    await second.click()
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await expect(second).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#pi-ss-each')).toHaveClass(/active/)
  } finally { await picker.close() }
})

test('new notes keep the initial Crop choice after earlier notes change mode', async ({ page }) => {
  const { picker } = await start(page, 'crop')
  try {
    await expect(page.getByRole('button', { name: 'Select an element', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.locator('#target').hover()
    await page.locator('#target').click()
    const notes = page.locator('.pi-note-card')
    await expect(notes).toHaveCount(1)
    const first = notes.nth(0).locator('.pi-note-screenshot')
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#pi-ss-none')).toHaveClass(/active/)
    await page.locator('#second').hover()
    await page.locator('#second').click()
    await expect(notes).toHaveCount(2)
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await expect(notes.nth(1).locator('.pi-note-screenshot')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#pi-ss-each')).toHaveClass(/active/)
  } finally { await picker.close() }
})

test('multi-selection and X cancellation retain the same picker connection', async ({ page }) => {
  const { picker, events } = await start(page)
  try {
    await expect(page.getByRole('button', { name: 'Select an element' })).toHaveAttribute('aria-pressed', 'true')
    for (const id of ['target', 'second']) { await page.locator('#' + id).hover(); await page.locator('#' + id).click() }
    await expect(page.locator('.pi-note-card')).toHaveCount(2)
    await expect(page.locator('#pi-count')).toHaveText('2')
    await page.getByRole('button', { name: 'Cancel annotation' }).click()
    await expect(page.locator('#pi-panel')).toHaveCount(0)
    await expect.poll(() => events.length).toBe(1)
    expect(events[0]).toMatchObject({ outcome: 'cancelled', notes: [] })
    await picker.start('presentation-resumed', 'none')
    await expect(page.getByRole('toolbar', { name: 'Electron Annotate' })).toBeVisible()
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

test('floating note details stay under the pointer and minimize preserves the draft', async ({ page }) => {
  const { picker } = await start(page)
  try {
    await page.locator('#target').click()
    const card = page.locator('.pi-note-card')
    const text = card.getByRole('textbox', { name: 'Feedback' })
    await text.fill('Keep this exact draft.')
    const toggle = card.locator('.pi-cnc-details-toggle')
    await expect(toggle).toBeVisible()
    const point = (await toggle.boundingBox())!
    for (let index = 0; index < 4; index++) {
      await page.mouse.click(point.x + point.width / 2, point.y + point.height / 2)
      await expect(toggle).toHaveAttribute('aria-expanded', String(index % 2 === 0))
      const next = (await toggle.boundingBox())!
      expect(next.x).toBeCloseTo(point.x, 1)
      expect(next.y).toBeCloseTo(point.y, 1)
    }
    await toggle.click()
    await expect(card.getByRole('region', { name: 'Selected element details' })).toContainText('#target')
    await card.getByRole('button', { name: 'Minimize annotation', exact: true }).click()
    await expect(text).toBeHidden()
    await expect(page.locator('#pi-count')).toContainText('1')
    await page.locator('.pi-marker-badge').click()
    await expect(text).toHaveValue('Keep this exact draft.')
    await expect(text).toBeVisible()
  } finally { await picker.close() }
})

test('floating history restores deleted notes, original editor nodes and independent image choices', async ({ page }) => {
  const { picker, events } = await start(page)
  try {
    for (const id of ['target', 'second']) await page.locator('#' + id).click()
    const cards = page.locator('.pi-note-card')
    await expect(cards).toHaveCount(2)
    await cards.nth(0).getByRole('textbox', { name: 'Feedback' }).fill('First literal note {{keep}}')
    await cards.nth(1).getByRole('textbox', { name: 'Feedback' }).fill('Second note')
    await cards.nth(0).getByRole('button', { name: 'Add screenshot', exact: true }).click()
    await page.evaluate(() => { (window as any).originalEditor = document.querySelector('.pi-note-textarea') })
    await cards.nth(0).getByRole('button', { name: 'Delete annotation', exact: true }).click()
    await expect(cards).toHaveCount(1)
    await page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    await expect(cards).toHaveCount(2)
    expect(await page.evaluate(() => document.querySelector('.pi-note-textarea') === (window as any).originalEditor)).toBe(true)
    await expect(cards.nth(0).getByRole('textbox', { name: 'Feedback' })).toHaveValue('First literal note {{keep}}')
    await expect(cards.nth(0).getByRole('button', { name: 'Remove screenshot', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(cards.nth(1).getByRole('button', { name: 'Add screenshot', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Redo annotation change', exact: true }).click()
    await expect(cards).toHaveCount(1)
    await page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    await cards.nth(0).getByRole('button', { name: 'Remove screenshot', exact: true }).click()
    await page.getByRole('button', { name: 'Hide annotations', exact: true }).click()
    await expect(cards.nth(0)).toBeHidden()
    await expect(page.locator('#pi-markers')).toBeHidden()
    await page.getByRole('button', { name: 'Send annotations', exact: true }).click()
    await expect.poll(() => events.length).toBe(1)
    expect(events[0]).toMatchObject({ outcome: 'submitted', mode: 'none', notes: [
      { name: 'Connect Codex', comment: 'First literal note {{keep}}' }, { name: 'Settings', comment: 'Second note' },
    ] })
  } finally { await picker.close() }
})

test('floating history refuses a replacement element instead of following its selector', async ({ page }) => {
  const { picker } = await start(page)
  try {
    await page.locator('#target').click()
    await page.getByRole('button', { name: 'Delete annotation', exact: true }).click()
    await page.evaluate(() => { const target = document.getElementById('target')!; target.replaceWith(target.cloneNode(true)) })
    await page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    await expect(page.locator('.pi-note-card')).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('changed')
    await expect(page.getByRole('button', { name: 'Send annotations', exact: true })).toBeDisabled()
  } finally { await picker.close() }
})

test('changing image intent after undo discards the old redo branch', async ({ page }) => {
  const { picker } = await start(page)
  try {
    await page.locator('#target').click()
    await page.getByRole('button', { name: 'Add screenshot', exact: true }).click()
    await page.locator('#second').click()
    await page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    await page.getByRole('button', { name: 'Remove screenshot', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Redo annotation change', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add screenshot', exact: true })).toHaveAttribute('aria-pressed', 'false')
  } finally { await picker.close() }
})

test('annotation history preserves newer drafts and image choices on surviving notes', async ({ page }) => {
  const { picker } = await start(page)
  try {
    await page.locator('#target').click()
    const first = page.locator('.pi-note-card').nth(0)
    await first.getByRole('textbox', { name: 'Feedback' }).fill('Initial draft')
    await page.locator('#second').click()
    await first.getByRole('textbox', { name: 'Feedback' }).fill('Latest surviving draft')
    await first.getByRole('button', { name: 'Add screenshot', exact: true }).click()
    await page.getByRole('button', { name: 'Undo annotation change', exact: true }).click()
    await expect(page.locator('.pi-note-card')).toHaveCount(1)
    await expect(first.getByRole('textbox', { name: 'Feedback' })).toHaveValue('Latest surviving draft')
    await expect(first.getByRole('button', { name: 'Remove screenshot', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Redo annotation change', exact: true }).click()
    await expect(first.getByRole('textbox', { name: 'Feedback' })).toHaveValue('Latest surviving draft')
  } finally { await picker.close() }
})

test('typing a short draft preserves the writing area and stationary footer', async ({ page }) => {
  const { picker } = await start(page)
  try {
    await page.locator('#target').click()
    const text = page.getByRole('textbox', { name: 'Feedback' })
    const before = (await text.boundingBox())!
    const toggleBefore = (await page.locator('.pi-cnc-details-toggle').boundingBox())!
    await text.fill('Short draft')
    expect((await text.boundingBox())!.height).toBeGreaterThanOrEqual(before.height)
    expect((await page.locator('.pi-cnc-details-toggle').boundingBox())!.y).toBeCloseTo(toggleBefore.y, 1)
  } finally { await picker.close() }
})
