const fs = require('node:fs/promises')
const { constants } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { randomUUID, createHash } = require('node:crypto')
const { dimensions } = require('../electron-annotations/images.cjs')
const { LIMITS } = require('./protocol.cjs')

function refused() { throw new Error('DEV_UI_IMAGE_REFUSED') }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function jsonRecord(bytes, fields) {
  let value
  try { value = JSON.parse(bytes) } catch { refused() }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) refused()
  return value
}
async function privateFile(file, limit) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.uid !== process.getuid() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 || before.size > limit) refused()
    const buffer = Buffer.alloc(Math.min(limit + 1, before.size + 1))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const bytes = buffer.subarray(0, bytesRead)
    const after = await handle.stat(); const current = await fs.lstat(file)
    if (bytes.length !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs
      || after.uid !== process.getuid() || after.nlink !== 1 || (after.mode & 0o777) !== 0o600
      || current.isSymbolicLink() || current.dev !== before.dev || current.ino !== before.ino || (current.mode & 0o777) !== 0o600 || await fs.realpath(file) !== file) refused()
    return bytes
  } finally { await handle.close() }
}
async function directoryIdentity(directory) {
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700
    || await fs.realpath(directory) !== directory || !/^cui-images-[A-Za-z0-9]+$/.test(path.basename(directory))) refused()
  return stat
}
async function readVerifiedImage(image, connection) {
  if (!image || typeof image.path !== 'string' || !path.isAbsolute(image.path) || !/^[a-f0-9-]{36}\.png$/.test(path.basename(image.path))) refused()
  const directory = path.dirname(image.path); const before = await directoryIdentity(directory)
  const owner = jsonRecord(await privateFile(path.join(directory, 'owner.json'), 4096), ['version', 'connection'])
  const record = jsonRecord(await privateFile(image.path.replace(/\.png$/, '.json'), 4096), ['version', 'connection', 'image'])
  if (!record.image || typeof record.image !== 'object' || typeof connection !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(connection)) refused()
  if (owner.version !== 1 || owner.connection !== connection || record.version !== 1 || record.connection !== connection
    || Object.keys(image).sort().join(',') !== 'bytes,height,mime,path,sha256,width'
    || ['path', 'sha256', 'width', 'height', 'bytes', 'mime'].some(key => record.image[key] !== image[key])) refused()
  const bytes = await privateFile(image.path, LIMITS.imageBytes)
  const size = dimensions(bytes)
  if (image.mime !== 'image/png' || bytes.length !== image.bytes || size.width !== image.width || size.height !== image.height
    || size.width > 8192 || size.height > 8192 || hash(bytes) !== image.sha256) refused()
  const after = await directoryIdentity(directory)
  if (after.dev !== before.dev || after.ino !== before.ino) refused()
  return bytes
}
function createImageStore(connection) {
  let directory
  let count = 0
  let total = 0
  async function root() {
    if (!directory) directory = (async () => {
      const value = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cui-images-')))
      await fs.chmod(value, 0o700)
      await fs.writeFile(path.join(value, 'owner.json'), JSON.stringify({ version: 1, connection }), { flag: 'wx', mode: 0o600 })
      await directoryIdentity(value)
      return value
    })()
    return directory
  }
  return {
    async save(bytes) {
      const size = dimensions(bytes)
      if (size.width > 8192 || size.height > 8192 || count >= 64 || total + bytes.length > 128 * 1024 * 1024) refused()
      count += 1; total += bytes.length
      const base = await root(); const file = path.join(base, `${randomUUID()}.png`)
      const image = { path: file, sha256: hash(bytes), width: size.width, height: size.height, bytes: bytes.length, mime: 'image/png' }
      await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
      await fs.writeFile(file.replace(/\.png$/, '.json'), JSON.stringify({ version: 1, connection, image }), { flag: 'wx', mode: 0o600 })
      await readVerifiedImage(image, connection)
      return image
    },
  }
}
// Eligibility only. A verified record does not grant deletion authority.
async function ownedImageRemovalCandidates(images, connection) {
  if (!Array.isArray(images) || images.length > 64) refused()
  const result = []
  for (const image of images) {
    await readVerifiedImage(image, connection)
    result.push({ path: image.path, bytes: image.bytes, sha256: image.sha256, removalAuthorized: false })
  }
  return result
}
module.exports = { createImageStore, readVerifiedImage, ownedImageRemovalCandidates }
