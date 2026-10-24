import { app } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { readLaunchConfig } = require('./launch-config.cjs')
const { startExternalApp } = require('./external-bootstrap.cjs')
let config
try {
  config = readLaunchConfig({ appRoot: process.env.PI_ANNOTATE_APP_ROOT,
    adapter: process.env.PI_ANNOTATE_ADAPTER, profile: process.env.PI_ANNOTATE_PROFILE })
  if (config.adapter !== 'openchamber') throw new Error('ANNOTATE_ELECTRON_LAUNCH_REFUSED')
} catch {
  console.error('OpenChamber annotation launch configuration was refused.')
  app.exit(1)
}
if (config) {
  process.on('message', value => {
    if (value && typeof value === 'object' && Object.keys(value).length === 2 && value.version === 1 && value.kind === 'quit') app.quit()
  })
  process.once('disconnect', () => app.quit())
  const owned = startExternalApp(config)
  owned.ready.catch(() => console.error('External OpenChamber annotation startup failed.'))
  // Electron holds readiness until this ESM entry and the app's pre-ready setup finish.
  await owned.prepared.catch(() => {})
}
