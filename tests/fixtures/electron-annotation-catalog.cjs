// Controlled hidden catalog generation. Never use owner windows or app data.
const { app, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { bootSyntheticWorkspace, rendererUrl } = require('../../scripts/electron-annotations/bootstrap.cjs')
let window, context
const report = { error: null, states: [], controls: [], cases: [] }
const main = code => window.webContents.executeJavaScript(code)
const world = code => window.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code }])
async function until(read, label) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error('CATALOG_CONDITION_' + label)
}
ipcMain.handle('cnc:electron-annotation', (event, value) => {
  if (event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== rendererUrl) throw new Error('CATALOG_SENDER_REFUSED')
  if (value.kind === 'hello') return { version: 1, scope: 'synthetic-annotation' }
  if (value.kind === 'status') return { phase: 'idle' }
  throw new Error('CATALOG_OPERATION_REFUSED')
})
async function collect(name) {
  const hash = await world('window.__CNC_ANNOTATION_POLICY__.fingerprint()')
  const controls = await main("[...document.querySelectorAll('button')].map(e=>(e.getAttribute('aria-label')||e.textContent||'').replace(/\\s+/g,' ').trim()).filter(Boolean)")
  const canonical = await world('window.__CNC_CATALOG_TEST_TEXT__')
  report.states.push(hash); report.controls.push(...controls); report.cases.push({ name, hash, canonical })
}
async function openSettings() {
  if (process.argv.includes('--annotation-sidebar-settings')) {
    await main("document.getElementById('sidebar-settings').click()")
  } else {
    await main("document.getElementById('composer-model').click()")
    await until(() => main("[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.trim()==='Manage Codex connection')"), 'MENU')
    await collect('model-menu')
    await main("[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.trim()==='Manage Codex connection').click()")
  }
  await until(() => main("[...document.querySelectorAll('[role=dialog] button')].some(e=>e.textContent.trim()==='Connect Codex')"), 'SETTINGS')
  await until(() => main("!document.querySelector('[role=menu]')"), 'MENU_CLOSED')
}
async function run() {
  await until(() => main("!!document.querySelector('.cm-content') && !!document.getElementById('composer-model')"), 'WORKSPACE')
  await world("(() => {const e=document.createElement('div');e.id='cnc-annotation-synthetic';e.textContent='Synthetic annotation workspace';document.body.appendChild(e)})()")
  await main("document.querySelector('.cm-content').focus()")
  await world(`Object.defineProperty(window,'__CNC_ANNOTATION_POLICY_CONTEXT__',{value:Object.freeze(${JSON.stringify({ home: context.home })}),writable:false,configurable:false});true`)
  const policy = fs.readFileSync(path.resolve(__dirname, '../../scripts/electron-annotations/content-policy.js'), 'utf8')
  // Private diagnostics contain only this fixed, fresh synthetic fixture.
  await world(policy.replace('    return value\n  }', '    window.__CNC_CATALOG_TEST_TEXT__ = value; return value\n  }'))
  for (const draft of ['', 'Synthetic annotation draft']) {
    if (draft) {
      await main("document.querySelector('.cm-content').focus()")
      await window.webContents.insertText(draft)
      await until(() => main("document.querySelector('.cm-content').textContent==='Synthetic annotation draft'"), 'DRAFT')
    }
  for (let theme = 0; theme < 2; theme++) {
    for (const width of [980, 1280, 1440, 1680]) {
      window.setContentSize(width, 800)
      await until(() => main(`innerWidth===${width}`), 'WIDTH')
      await collect('workspace-' + width + '-' + theme)
      await openSettings()
      await collect('settings-' + width + '-' + theme)
      await main("(() => {const e=document.createElement('button');e.id='synthetic-geometry-control';e.textContent='Geometry fixture';e.style.cssText='width:100px;height:40px;padding:0;border:0;box-sizing:border-box;background:rgb(245,20,30);color:white;flex:none;position:absolute;left:24px;top:380px';document.querySelector('[role=dialog]').appendChild(e)})()")
      await collect('geometry-' + width + '-' + theme)
      await main("document.getElementById('synthetic-geometry-control').remove()")
      if (theme === 0 && width === 1680) {
        const changed = await main("(() => {const e=[...document.querySelectorAll('[role=switch]')].find(n=>(n.getAttribute('aria-label')||document.getElementById(n.getAttribute('aria-labelledby'))?.textContent||n.closest('label')?.textContent||'').includes('Light color scheme'));if(!e)return false;e.click();return true})()")
        if (!changed) throw new Error('CATALOG_THEME_CONTROL_UNAVAILABLE')
      }
      await main("document.getElementById('sidebar-settings-dismiss').click()")
      await until(() => main("!document.querySelector('[role=dialog]')"), 'CLOSED')
    }
  }
  }
  report.states = [...new Set(report.states)].sort(); report.controls = [...new Set(report.controls)].sort()
}
void bootSyntheticWorkspace({ preloadFile: path.resolve(__dirname, '../../scripts/electron-annotations/runtime-preload.cjs'), onWindow(candidate, received) {
  window = candidate; context = received
  candidate.webContents.once('did-finish-load', () => { void run().catch(error => { report.error = error.message }).finally(() => {
    fs.writeFileSync(path.join(context.root, 'catalog-candidate.json'), JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' }); app.quit()
  }) })
} }).catch(() => app.quit())
