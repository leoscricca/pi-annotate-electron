const { dimensions } = require('../electron-annotations/images.cjs')
const { OperationFailure } = require('./connection.cjs')
const { LIMITS } = require('./protocol.cjs')

async function captureBytes(contents, params, geometry, isCurrent) {
  function guard() { if (!isCurrent()) throw new OperationFailure('STALE_TARGET', 'revoked') }
  guard()
  const before = await geometry(params)
  const view = before.viewport
  if (!Number.isInteger(view.width) || !Number.isInteger(view.height) || view.width < 1 || view.height < 1
    || view.width > 8192 || view.height > 8192 || !Number.isFinite(view.dpr) || view.dpr < 0.5 || view.dpr > 4
    || view.width * view.height * view.dpr ** 2 > LIMITS.pixels) throw new OperationFailure('UNAVAILABLE', 'refused')
  let crop
  if (params.ref) {
    const bounds = before.rect
    const left = Math.max(0, bounds.x); const top = Math.max(0, bounds.y)
    const right = Math.min(view.width, bounds.x + bounds.width); const bottom = Math.min(view.height, bounds.y + bounds.height)
    if (right <= left || bottom <= top) throw new OperationFailure('STALE_REFERENCE', 'refused')
    const x = Math.floor(left * view.dpr); const y = Math.floor(top * view.dpr)
    crop = { x, y, width: Math.ceil(right * view.dpr) - x, height: Math.ceil(bottom * view.dpr) - y }
  }
  try {
    guard()
    const image = await contents.capturePage(undefined, { stayHidden: true, stayAwake: false })
    guard()
    const after = await geometry(params)
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new OperationFailure('STALE_REFERENCE', 'refused')
    if (image.isEmpty()) throw new OperationFailure('OPERATION_FAILED', 'failed')
    let bytes = image.toPNG()
    const size = dimensions(bytes)
    if (size.width !== Math.round(view.width * view.dpr) || size.height !== Math.round(view.height * view.dpr)) {
      throw new OperationFailure('OPERATION_FAILED', 'failed')
    }
    if (crop) {
      const source = require('electron').nativeImage.createFromBuffer(bytes)
      if (source.isEmpty()) throw new OperationFailure('OPERATION_FAILED', 'failed')
      bytes = source.crop(crop).toPNG()
      const actual = dimensions(bytes)
      if (actual.width !== crop.width || actual.height !== crop.height) throw new OperationFailure('OPERATION_FAILED', 'failed')
    }
    guard()
    return { bytes, viewport: view }
  } catch (error) {
    if (error instanceof OperationFailure) throw error
    throw new OperationFailure('OPERATION_FAILED', 'failed')
  }
}
async function captureImage(contents, params, geometry, isCurrent, store) {
  const result = await captureBytes(contents, params, geometry, isCurrent)
  const saved = await store.save(result.bytes)
  if (!isCurrent()) throw new OperationFailure('STALE_TARGET', 'revoked')
  return { image: saved, viewport: result.viewport }
}
module.exports = { captureImage, captureBytes }
