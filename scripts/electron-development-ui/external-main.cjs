const { app } = require('electron')
const { readLaunchConfig } = require('./launch-config.cjs')
const { startExternalApp } = require('./external-bootstrap.cjs')

let config
try {
  config = readLaunchConfig({ appRoot: process.env.PI_ANNOTATE_APP_ROOT,
    entry: process.env.PI_ANNOTATE_APP_ENTRY, renderer: process.env.PI_ANNOTATE_RENDERER_FILE,
    ...(process.env.PI_ANNOTATE_PROFILE ? { profile: process.env.PI_ANNOTATE_PROFILE } : {}) })
} catch {
  // No bridge or target app exists at this preflight boundary.
  console.error('Electron annotation launch configuration was refused.')
  app.exit(1)
}
if (config) {
  process.on('message', value => {
    if (value && typeof value === 'object' && Object.keys(value).length === 2 && value.version === 1 && value.kind === 'quit') app.quit()
  })
  process.once('disconnect', () => app.quit())
  const owned = startExternalApp(config)
  owned.ready.catch(error => console.error('External annotation startup failed.', /^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'STARTUP_FAILED'))
}
