const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { app, ipcMain, session } = require('electron')
const { installDevelopmentUi, prepareDevelopmentUi } = require('./host.cjs')

// The caller supplies the explicit, validated owner launch configuration.
function startExternalApp(config) {
  const extensionRoot = path.resolve(__dirname, '../..')
  app.setName(config.name)
  app.setAppPath(config.appRoot)
  if (config.profile) {
    fs.mkdirSync(config.profile, { recursive: true, mode: 0o700 })
    app.setPath('userData', config.profile)
    app.setPath('sessionData', config.profile)
  }
  const early = config.adapter === 'openchamber'
  if (early) {
    process.env.OPENCHAMBER_ELECTRON_DEV = '1'
    process.env.OPENCHAMBER_ELECTRON_USE_BUNDLED_UI = '1'
    process.env.OPENCHAMBER_DESKTOP_USER_DATA_DIR = config.profile
    delete process.env.OPENCHAMBER_ELECTRON_LOAD_SERVER_UI
    delete process.env.OPENCHAMBER_ELECTRON_REMOTE_DEBUGGING_PORT
  }
  let host, startup, closing, activationFailure, quitReady = false, quitRequested = false
  let preparedResolve, preparedReject
  const prepared = early ? new Promise((resolve, reject) => { preparedResolve = resolve; preparedReject = reject }) : Promise.resolve()
  void prepared.catch(() => {})
  const activate = () => { try { host.activate() } catch (error) { activationFailure = error } }
  const cancelled = Object.assign(new Error('External startup was cancelled before app import.'), { code: 'EXTERNAL_STARTUP_CANCELLED' })
  const register = (_event, window) => {
    if (early) {
      const contents = window.webContents, preferences = contents.getLastWebPreferences()
      if (activationFailure || window.getParentWindow() || contents.session !== session.defaultSession
        || preferences.contextIsolation !== true || preferences.nodeIntegration !== false) return
    }
    host.registerWindow(window, early ? { kind: 'url', value: 'openchamber-ui://app/index.html' } : { kind: 'file', value: config.renderer })
  }
  const nativeExit = early ? app.exit.bind(app) : undefined
  let exitCode
  const beginClose = () => {
    quitRequested = true
    app.off('browser-window-created', register)
    app.off('ready', activate)
    if (closing) return
    closing = (async () => {
      let startupFailure
      try { await startup } catch (error) { startupFailure = error }
      if (startupFailure && startupFailure !== cancelled && !host) throw new Error('EXTERNAL_STARTUP_CLEANUP_UNCONFIRMED')
      if (host) await host.close()
      app.off('browser-window-created', register)
      quitReady = true
      if (exitCode !== undefined) nativeExit(exitCode)
      else app.quit()
    })()
    closing.catch(() => console.error('External annotation cleanup remains unconfirmed. Normal quit stays blocked.'))
  }
  if (early) {
    // OpenChamber confirms quit itself, then app.exit bypasses ordinary quit events.
    app.exit = code => {
      if (quitReady) return nativeExit(code)
      exitCode ??= code ?? 0
      beginClose()
    }
  }
  app.on('before-quit', event => {
    // A ready product can cancel quit; will-quit still guards an unowned quit.
    if (quitReady || (early && app.isReady() && !quitRequested)) return
    event.preventDefault()
    beginClose()
  })
  app.on('will-quit', event => {
    if (!early || quitReady) return
    event.preventDefault()
    beginClose()
  })
  startup = (async () => {
    if (!early) await app.whenReady()
    if (quitRequested) throw cancelled
    if (app.isPackaged) throw new Error('DEV_UI_DEVELOPMENT_ONLY')
    if (early && app.isReady()) throw new Error('EXTERNAL_PRE_READY_REQUIRED')
    host = await (early ? prepareDevelopmentUi : installDevelopmentUi)({ app, ipcMain, session, repositoryRoot: extensionRoot,
      ...(early ? { label: config.name } : {}) })
    if (quitRequested) throw cancelled
    if (early) {
      if (app.isReady()) throw new Error('EXTERNAL_PRE_READY_REQUIRED')
      app.once('ready', activate)
    }
    app.on('browser-window-created', register)
    await import(pathToFileURL(config.entry).href)
    if (quitRequested) throw cancelled
    preparedResolve?.()
    if (early) {
      await app.whenReady()
      if (activationFailure) throw activationFailure
    }
  })()
  startup.catch(error => {
    preparedReject?.(error)
    app.off('ready', activate)
    app.off('browser-window-created', register)
    if (host) void host.close().catch(() => console.error('Failed-startup bridge cleanup remains unconfirmed.'))
  })
  return { ready: startup, prepared }
}
module.exports = { startExternalApp }
