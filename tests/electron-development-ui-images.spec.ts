import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { createImageStore, readVerifiedImage, ownedImageRemovalCandidates } = require('../scripts/electron-development-ui/images.cjs')
const { captureImage } = require('../scripts/electron-development-ui/capture.cjs')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64')
const directories = new Set<string>()
test.skip(process.platform === 'win32', 'Private Unix image ownership is the initial supported boundary.')
test.afterEach(async ({}, info) => {
  for (const directory of directories) {
    if (info.status === 'passed') await fs.rm(directory, { recursive: true })
    else console.log(`Retained owned image fixture: ${directory}`)
  }
  directories.clear()
})
async function image() {
  const result = await createImageStore('image-fixture-connection').save(png)
  directories.add(path.dirname(result.path))
  return result
}

test('owned PNG bytes, metadata and private permissions are verified before delivery or removal eligibility', async () => {
  const result = await image()
  expect(result).toMatchObject({ width: 1, height: 1, bytes: png.length, mime: 'image/png' })
  expect(await readVerifiedImage(result, 'image-fixture-connection')).toEqual(png)
  expect((await fs.stat(result.path)).mode & 0o777).toBe(0o600)
  expect((await fs.stat(path.dirname(result.path))).mode & 0o777).toBe(0o700)
  expect(await ownedImageRemovalCandidates([result], 'image-fixture-connection')).toEqual([
    { path: result.path, bytes: png.length, sha256: result.sha256, removalAuthorized: false },
  ])
  await expect(readVerifiedImage(result, 'another-connection')).rejects.toThrow('DEV_UI_IMAGE_REFUSED')
  await expect(readVerifiedImage({ ...result, sha256: '0'.repeat(64) }, 'image-fixture-connection')).rejects.toThrow('DEV_UI_IMAGE_REFUSED')
  await fs.chmod(result.path, 0o644)
  await expect(readVerifiedImage(result, 'image-fixture-connection')).rejects.toThrow('DEV_UI_IMAGE_REFUSED')
  await fs.chmod(result.path, 0o600)
})

test('replacement bytes, file symlinks and malformed owner records cannot become image content', async () => {
  const result = await image()
  const changed = Buffer.from(png); changed[changed.length - 1] ^= 1
  await fs.writeFile(result.path, changed)
  await expect(readVerifiedImage(result, 'image-fixture-connection')).rejects.toThrow('DEV_UI_IMAGE_REFUSED')
  const moved = `${result.path}.moved`
  await fs.rename(result.path, moved); await fs.symlink(moved, result.path)
  await expect(readVerifiedImage(result, 'image-fixture-connection')).rejects.toThrow()
  await fs.unlink(result.path); await fs.rename(moved, result.path)
  await fs.writeFile(result.path, png)
  await fs.writeFile(path.join(path.dirname(result.path), 'owner.json'), '{bad json')
  await expect(readVerifiedImage(result, 'image-fixture-connection')).rejects.toThrow('DEV_UI_IMAGE_REFUSED')
})

test('unsupported viewport geometry is refused before any native capture or file write', async () => {
  let captures = 0; let saves = 0
  const contents = { capturePage: async () => { captures += 1; return undefined } }
  const store = { save: async () => { saves += 1; return undefined } }
  for (const viewport of [{ width: 8193, height: 1, dpr: 1 }, { width: 4096, height: 4096, dpr: 2 },
    { width: 1, height: 1, dpr: 5 }, { width: 0, height: 1, dpr: 1 }]) {
    await expect(captureImage(contents, {}, async () => ({ viewport }), () => true, store))
      .rejects.toMatchObject({ code: 'UNAVAILABLE', outcome: 'refused' })
  }
  expect(captures).toBe(0); expect(saves).toBe(0)
})

test('capture failure and changed geometry produce explicit failure rather than a fabricated image', async () => {
  const geometry = { viewport: { width: 1, height: 1, dpr: 1, scrollX: 0, scrollY: 0 } }
  let captures = 0; let saves = 0
  const store = { save: async () => { saves += 1; return undefined } }
  const unavailable = { capturePage: async () => { captures += 1; throw new Error('Synthetic native capture failure') } }
  await expect(captureImage(unavailable, {}, async () => geometry, () => false, store)).rejects.toMatchObject({ code: 'STALE_TARGET', outcome: 'revoked' })
  expect(captures).toBe(0)
  await expect(captureImage(unavailable, {}, async () => geometry, () => true, store)).rejects.toMatchObject({ code: 'OPERATION_FAILED', outcome: 'failed' })
  expect(captures).toBe(1)
  let reads = 0
  const changed = async () => ({ viewport: { ...geometry.viewport, width: ++reads } })
  const contents = { capturePage: async () => { captures += 1; return { isEmpty: () => false, toPNG: () => png } } }
  await expect(captureImage(contents, {}, changed, () => true, store)).rejects.toMatchObject({ code: 'STALE_REFERENCE', outcome: 'refused' })
  expect(captures).toBe(2); expect(saves).toBe(0)
})
