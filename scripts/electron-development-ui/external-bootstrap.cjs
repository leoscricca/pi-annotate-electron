const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { app, ipcMain, session } = require('electron')
const { installDevelopmentUi } = require('./host.cjs')

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
  let host, startup, closing, quitReady = false, quitRequested = false
  const cancelled = Object.assign(new Error('External startup was cancelled before app import.'), { code: 'EXTERNAL_STARTUP_CANCELLED' })
  const register = (_event, window) => host.registerWindow(window, { kind: 'file', value: config.renderer })
  app.on('before-quit', event => {
    if (quitReady) return
    event.preventDefault()
    quitRequested = true
    app.off('browser-window-created', register)
    if (closing) return
    closing = (async () => {
      let startupFailure
      try { await startup } catch (error) { startupFailure = error }
      if (startupFailure && startupFailure !== cancelled && !host) throw new Error('EXTERNAL_STARTUP_CLEANUP_UNCONFIRMED')
      if (host) await host.close()
      app.off('browser-window-created', register)
      quitReady = true
      app.quit()
    })()
    closing.catch(() => console.error('External annotation cleanup remains unconfirmed. Normal quit stays blocked.'))
  })
  startup = (async () => {
    await app.whenReady()
    if (quitRequested) throw cancelled
    if (app.isPackaged) throw new Error('DEV_UI_DEVELOPMENT_ONLY')
    host = await installDevelopmentUi({ app, ipcMain, session, repositoryRoot: extensionRoot })
    if (quitRequested) throw cancelled
    app.on('browser-window-created', register)
    await import(pathToFileURL(config.entry).href)
  })()
  startup.catch(() => {
    app.off('browser-window-created', register)
    if (host) void host.close().catch(() => console.error('Failed-startup bridge cleanup remains unconfirmed.'))
  })
  return { ready: startup }
}
module.exports = { startExternalApp }
