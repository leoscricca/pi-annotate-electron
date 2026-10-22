const fs = require('node:fs')
const path = require('node:path')
function refuse() { throw new Error('ANNOTATE_ELECTRON_LAUNCH_REFUSED') }
function text(value) { if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0')) refuse(); return value }
function inside(root, value) {
  const result = fs.realpathSync(path.resolve(root, text(value)))
  const relative = path.relative(root, result)
  if (!relative || relative === '..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) refuse()
  if (!fs.statSync(result).isFile()) refuse()
  return result
}
function readLaunchConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['appRoot','entry','renderer','profile'].includes(key))) refuse()
  if (process.platform !== 'darwin') throw new Error('ANNOTATE_ELECTRON_MACOS_ONLY')
  const appRoot = fs.realpathSync(path.resolve(text(value.appRoot)))
  if (!fs.statSync(appRoot).isDirectory() || appRoot.split(path.sep).some(part => part.endsWith('.app') || part.endsWith('.asar'))) refuse()
  const packageFile = inside(appRoot, 'package.json')
  const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
  const entry = inside(appRoot, value.entry ?? metadata.main ?? 'out/main/index.js')
  const renderer = inside(appRoot, value.renderer)
  const name = typeof metadata.productName === 'string' ? metadata.productName : typeof metadata.name === 'string' ? metadata.name : 'Electron development app'
  if (!name || name.length > 128 || /[\x00-\x1f/\\]/.test(name)) refuse()
  let profile
  if (value.profile !== undefined) {
    profile = path.resolve(text(value.profile))
    if (fs.existsSync(profile)) {
      const stat = fs.lstatSync(profile)
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) refuse()
    }
  }
  return Object.freeze({ appRoot, entry, renderer, name, ...(profile ? { profile } : {}) })
}
module.exports = { readLaunchConfig }
