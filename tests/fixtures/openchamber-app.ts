import fs from 'node:fs/promises'
import path from 'node:path'

export async function writeOpenChamberFixture(root: string) {
  const app = path.join(root, 'app')
  const desktop = path.join(app, 'packages/electron')
  await fs.mkdir(path.join(desktop, 'resources/web-dist'), { recursive: true, mode: 0o700 })
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'openchamber-monorepo', type: 'module' }), { mode: 0o600 })
  await fs.writeFile(path.join(desktop, 'package.json'), JSON.stringify({ name: '@openchamber/electron', type: 'module' }), { mode: 0o600 })
  await fs.copyFile(path.resolve('tests/fixtures/openchamber-entry.mjs'), path.join(desktop, 'entry.mjs'))
  await fs.writeFile(path.join(desktop, 'resources/web-dist/index.html'), `<!doctype html><title>Owned OpenChamber compatibility fixture</title>
    <style>body { background: white; padding: 30px; } button, input { padding: 20px; }</style>
    <button id="target" onclick="this.dataset.activations=String(Number(this.dataset.activations)+1)" data-activations="0">Sample action</button>
    <input id="draft" aria-label="Draft" value="Keep this draft">
    <p>Fictional offline compatibility data.</p>`, { mode: 0o600 })
  return app
}
