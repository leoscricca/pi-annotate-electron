const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { app, session } = require('electron')

function requireFixture(condition) { if (!condition) throw new Error('DEV_UI_FIXTURE_BOOT_REFUSED') }
const root = process.env.CNC_DEV_UI_FIXTURE_ROOT
requireFixture(root && path.isAbsolute(root) && fs.existsSync(path.join(root, '.owned-dev-ui-fixture')))
const home = path.join(root, 'home')
const profile = path.join(root, 'profile')
const temp = path.join(root, 'tmp')
for (const directory of [home, profile, temp]) {
  const stat = fs.lstatSync(directory)
  requireFixture(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o700)
}
requireFixture(process.env.CNC_MENDIX_E2E_HOME === home && process.env.HOME === home)
app.setPath('home', home)
app.setPath('userData', profile)
app.setPath('sessionData', profile)
app.setPath('temp', temp)
requireFixture(app.getPath('home') === home && app.getPath('userData') === profile && app.getPath('temp') === temp)
app.setActivationPolicy('prohibited')
app.commandLine.appendSwitch('disable-gpu')
process.argv.push('--e2e-hidden')
void app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !/^(file|data|devtools):/.test(details.url) })
  })
  const main = process.argv[2]
  requireFixture(main && path.isAbsolute(main) && fs.lstatSync(main).isFile())
  if (process.argv.includes('--external-bridge')) {
    const { readLaunchConfig } = require('../../scripts/electron-development-ui/launch-config.cjs')
    const { startExternalApp } = require('../../scripts/electron-development-ui/external-bootstrap.cjs')
    const config = readLaunchConfig({ appRoot: path.dirname(path.dirname(main)), entry: main,
      renderer: path.join(path.dirname(path.dirname(main)), 'renderer/index.html') })
    await startExternalApp(config).ready
  } else {
    await import(pathToFileURL(main).href)
  }
}).catch(error => {
  console.error('Owned development UI fixture failed:', error)
  process.exitCode = 1
  app.quit()
})
