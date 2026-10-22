import { expect, test } from '@playwright/test'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { cropRectangle, dimensions, decode } = require('../scripts/electron-annotations/images.cjs')

test('crop geometry is literal at device scales one and two, scroll, and clipped viewport edges', () => {
  const bounds = { x: 100, y: 200, width: 100, height: 40 }
  expect(cropRectangle(bounds, { width: 980, height: 800, dpr: 1, scrollX: 0, scrollY: 0 })).toEqual({ x: 80, y: 180, width: 140, height: 80 })
  expect(cropRectangle(bounds, { width: 1280, height: 800, dpr: 2, scrollX: 0, scrollY: 0 })).toEqual({ x: 160, y: 360, width: 280, height: 160 })
  expect(cropRectangle(bounds, { width: 1440, height: 800, dpr: 1, scrollX: 0, scrollY: 150 })).toEqual({ x: 80, y: 30, width: 140, height: 80 })
  expect(cropRectangle({ x: 2, y: 3, width: 10, height: 10 }, { width: 980, height: 800, dpr: 1, scrollX: 0, scrollY: 0 })).toEqual({ x: 0, y: 0, width: 32, height: 33 })
  expect(() => cropRectangle({ x: 9000, y: 3, width: 10, height: 10 }, { width: 980, height: 800, dpr: 1, scrollX: 0, scrollY: 0 })).toThrow('ANNOTATION_STALE_GEOMETRY')
})

test('PNG boundary accepts an actual bounded PNG header and refuses non-PNG or malformed encoding', () => {
  const encoded = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP5kAAAAASUVORK5CYII='
  const bytes = decode('data:image/png;base64,' + encoded)
  expect(dimensions(bytes)).toEqual({ width: 1, height: 1 })
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(() => decode('data:text/html;base64,' + encoded)).toThrow('ANNOTATION_PNG_REFUSED')
  expect(() => decode('data:image/png;base64,invalid!')).toThrow('ANNOTATION_PNG_REFUSED')
  expect(() => dimensions(Buffer.from('not an image'))).toThrow('ANNOTATION_PNG_REFUSED')
})
