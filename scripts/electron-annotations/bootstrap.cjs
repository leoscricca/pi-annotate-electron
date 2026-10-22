const { app, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const repository = path.resolve(__dirname, '../..')
const rendererUrl = pathToFileURL(path.join(repository, 'out/renderer/index.html')).href
function requireCondition(condition, code) { if (!condition) throw new Error(code) }

function verifySyntheticEnvironment() {
  requireCondition(process.platform === 'darwin' && !app.isPackaged, 'ANNOTATION_PLATFORM_REFUSED')
  const rawHome = process.env.CNC_MENDIX_E2E_HOME
  requireCondition(typeof rawHome === 'string' && path.isAbsolute(rawHome), 'ANNOTATION_HOME_REFUSED')
  const home = fs.realpathSync(rawHome), root = path.dirname(home), profile = path.join(root, 'profile')
  requireCondition(path.basename(root).startsWith('cnc-codex-desktop-') && home === path.join(root, 'home'), 'ANNOTATION_ROOT_REFUSED')
  requireCondition(process.env.HOME === home && process.env.TMPDIR === path.join(root, 'tmp'), 'ANNOTATION_ENVIRONMENT_REFUSED')
  requireCondition(process.argv.includes('--e2e-hidden') && process.argv.includes('--e2e-conversation-fixture')
    && process.argv.includes(`--user-data-dir=${profile}`), 'ANNOTATION_FLAGS_REFUSED')
  requireCondition(!app.commandLine.hasSwitch('remote-debugging-port') && !process.execArgv.some(value => value.startsWith('--inspect')),
    'ANNOTATION_DEBUG_ENDPOINT_REFUSED')
  for (const name of ['home', 'profile', 'tmp', 'captures']) {
    const file = path.join(root, name), stat = fs.lstatSync(file)
    requireCondition(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid()
      && (stat.mode & 0o777) === 0o700 && fs.realpathSync(file) === file, 'ANNOTATION_DIRECTORY_REFUSED')
  }
  const markerPath = path.join(profile, 'conversation-fixture.json'), stat = fs.lstatSync(markerPath)
  requireCondition(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600,
    'ANNOTATION_MARKER_REFUSED')
  let marker
  try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) }
  catch { throw new Error('ANNOTATION_MARKER_REFUSED') }
  requireCondition(marker && marker.version === 1 && marker.suite === 'synthetic-codex-v1' && marker.home === home && marker.profile === profile,
    'ANNOTATION_MARKER_REFUSED')
  app.setPath('home', home)
  if (process.platform === 'darwin') app.setActivationPolicy('prohibited')
  return { home, root, profile, repository, rendererUrl }
}

async function bootSyntheticWorkspace({ onWindow, preloadFile }) {
  const context = verifySyntheticEnvironment()
  await app.whenReady()
  requireCondition(fs.realpathSync(app.getPath('home')) === context.home
    && fs.realpathSync(app.getPath('userData')) === context.profile, 'ANNOTATION_RESOLVED_PATH_REFUSED')
  const preload = session.defaultSession.registerPreloadScript({ type: 'frame', filePath: preloadFile })
  let window
  app.on('browser-window-created', (_event, candidate) => {
    if (window) return
    window = candidate
    onWindow(candidate, context)
  })
  app.once('will-quit', () => session.defaultSession.unregisterPreloadScript(preload))
  await import(pathToFileURL(path.join(repository, 'out/main/index.js')).href)
  return context
}

module.exports = { bootSyntheticWorkspace, verifySyntheticEnvironment, requireCondition, rendererUrl }
