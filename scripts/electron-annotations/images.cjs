const { createHash } = require('node:crypto')
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
function dimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.length > 10 * 1024 * 1024
    || !bytes.subarray(0, 8).equals(signature) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('ANNOTATION_PNG_REFUSED')
  }
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (!width || !height || width * height > 16_777_216) throw new Error('ANNOTATION_PNG_REFUSED')
  return { width, height }
}
function decode(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('ANNOTATION_PNG_REFUSED')
  const encoded = dataUrl.slice(22)
  if (encoded.length > 14 * 1024 * 1024 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded)) throw new Error('ANNOTATION_PNG_REFUSED')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded) throw new Error('ANNOTATION_PNG_REFUSED')
  dimensions(bytes)
  return bytes
}
function cropRectangle(bounds, viewport) {
  const left = Math.max(0, bounds.x - viewport.scrollX - 20), top = Math.max(0, bounds.y - viewport.scrollY - 20)
  const right = Math.min(viewport.width, bounds.x - viewport.scrollX + bounds.width + 20)
  const bottom = Math.min(viewport.height, bounds.y - viewport.scrollY + bounds.height + 20)
  if (right <= left || bottom <= top) throw new Error('ANNOTATION_STALE_GEOMETRY')
  return { x: Math.floor(left * viewport.dpr), y: Math.floor(top * viewport.dpr),
    width: Math.max(1, Math.floor((right - left) * viewport.dpr)), height: Math.max(1, Math.floor((bottom - top) * viewport.dpr)) }
}
function canonicalCrops(nativeImage, full, packet) {
  if (packet.mode === 'none') {
    if (full || packet.images.length) throw new Error('ANNOTATION_NONE_CAPTURED')
    return []
  }
  const requested = packet.selections.map((selection, index) => ({ selection, index })).filter(item => item.selection.image !== false)
  if (!full || packet.images.length !== requested.length || !requested.length) throw new Error('ANNOTATION_CAPTURE_MISSING')
  const frameSize = dimensions(full), view = packet.viewport
  if (frameSize.width !== Math.round(view.width * view.dpr) || frameSize.height !== Math.round(view.height * view.dpr)) throw new Error('ANNOTATION_CAPTURE_SCALE')
  const source = nativeImage.createFromBuffer(full)
  if (source.isEmpty()) throw new Error('ANNOTATION_PNG_REFUSED')
  return requested.map(({ selection, index }) => {
    const image = packet.images.find(image => image.index === index + 1)
    if (!image) throw new Error('ANNOTATION_CAPTURE_MISSING')
    const supplied = decode(image.dataUrl), size = dimensions(supplied), rect = cropRectangle(selection.bounds, view)
    if (supplied.equals(full) || size.width !== rect.width || size.height !== rect.height
      || rect.width >= frameSize.width && rect.height >= frameSize.height) throw new Error('ANNOTATION_UNCROPPED_IMAGE')
    const decoded = nativeImage.createFromBuffer(supplied)
    if (decoded.isEmpty()) throw new Error('ANNOTATION_PNG_REFUSED')
    const bytes = source.crop(rect).toPNG(), verified = dimensions(bytes)
    if (verified.width !== rect.width || verified.height !== rect.height) throw new Error('ANNOTATION_PNG_REFUSED')
    return { index: index + 1, bytes, dimensions: verified, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
}
module.exports = { dimensions, decode, cropRectangle, canonicalCrops }
