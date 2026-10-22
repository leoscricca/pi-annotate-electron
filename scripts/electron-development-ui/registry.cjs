const fs = require('node:fs/promises')
const { constants } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { randomUUID, randomBytes } = require('node:crypto')

function refused(code) { throw new Error(code) }
function instanceId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) refused('DEV_UI_REGISTRATION_REFUSED')
}
function owned(stat, mode) {
  return typeof process.getuid === 'function' && stat.uid === process.getuid() && (stat.mode & 0o777) === mode
}
async function registryDirectory(directory, create = false) {
  if (process.platform === 'win32') refused('DEV_UI_PLATFORM_UNSUPPORTED')
  const name = path.resolve(directory ?? path.join(await fs.realpath(os.tmpdir()), `cui-${process.getuid()}`))
  if (create) {
    try { await fs.mkdir(name, { mode: 0o700 }) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
  }
  const stat = await fs.lstat(name)
  if (stat.isSymbolicLink() || !stat.isDirectory() || !owned(stat, 0o700)) refused('DEV_UI_REGISTRY_REFUSED')
  return fs.realpath(name)
}
async function readRegistration(directory, instance) {
  instanceId(instance)
  const root = await registryDirectory(directory)
  const file = path.join(root, `${instance}.json`)
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    if (!before.isFile() || !owned(before, 0o600) || before.size < 1 || before.size > 4096) refused('DEV_UI_REGISTRATION_REFUSED')
    const bytes = Buffer.alloc(4097)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    const after = await handle.stat()
    if (bytesRead !== before.size || bytesRead > 4096 || after.size !== before.size || after.mtimeMs !== before.mtimeMs) refused('DEV_UI_REGISTRATION_REFUSED')
    let value
    try { value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')) }
    catch { refused('DEV_UI_REGISTRATION_REFUSED') }
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'instance,socket,token,version'
      || value.version !== 1 || value.instance !== instance || value.socket !== `s-${instance.replaceAll('-', '').slice(0, 20)}`
      || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) refused('DEV_UI_REGISTRATION_REFUSED')
    return { ...value, directory: root, file, socketPath: path.join(root, value.socket), ino: before.ino, dev: before.dev }
  } finally { await handle.close() }
}
async function createRegistration(directory) {
  const root = await registryDirectory(directory, true)
  const instance = randomUUID()
  const value = { version: 1, instance, socket: `s-${instance.replaceAll('-', '').slice(0, 20)}`, token: randomBytes(32).toString('hex') }
  const socketPath = path.join(root, value.socket)
  if (Buffer.byteLength(socketPath) >= 104) refused('DEV_UI_SOCKET_PATH_LIMIT')
  const file = path.join(root, `${instance}.json`)
  await fs.writeFile(file, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
  return readRegistration(root, instance)
}
async function listRegistrations(directory) {
  let root
  try { root = await registryDirectory(directory) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
  const names = await fs.readdir(root)
  const entries = names.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))
  if (entries.length > 32) refused('DEV_UI_DISCOVERY_LIMIT')
  const result = []
  for (const file of entries.sort()) {
    try { result.push(await readRegistration(root, file.slice(0, -5))) }
    catch { /* A stale or invalid registration grants no access and remains evidence. */ }
  }
  return result
}
async function removeRegistration(entry) {
  const current = await readRegistration(entry.directory, entry.instance)
  if (current.ino !== entry.ino || current.dev !== entry.dev || current.token !== entry.token) refused('DEV_UI_REGISTRATION_CHANGED')
  await fs.unlink(entry.file)
}

module.exports = { registryDirectory, createRegistration, readRegistration, listRegistrations, removeRegistration }
