import { mkdir, readFile, copyFile, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--output' || !path.isAbsolute(args[1]))) throw new Error('FIXTURE_BUILD_ARGUMENTS_REFUSED')
const output = args.length ? args[1] : path.join(root, 'out')
if (output !== path.join(root, 'out')) {
  const marker = await lstat(path.join(output, '.owned-dev-ui-fixture'))
  if (!marker.isFile() || marker.isSymbolicLink()) throw new Error('FIXTURE_OUTPUT_REFUSED')
}
for (const part of ['main', 'preload', 'renderer']) await mkdir(path.join(output, part), { recursive: true })
await copyFile(path.join(root, 'fixtures/app/main.mjs'), path.join(output, 'main/index.js'))
await copyFile(path.join(root, 'fixtures/app/preload.cjs'), path.join(output, 'preload/index.cjs'))
for (const name of ['index.html', 'app.js', 'app.css']) await copyFile(path.join(root, 'fixtures/app', name), path.join(output, 'renderer', name))
await copyFile(path.join(root, 'design/openchamber/tokens.css'), path.join(output, 'renderer/tokens.css'))
const icon = await readFile(path.join(root, 'design/icons/pencil-ai.svg'), 'utf8')
const html = await readFile(path.join(output, 'renderer/index.html'), 'utf8')
await writeFile(path.join(output, 'renderer/index.html'), html.replace('<!--fixture-icon-->', () => icon.trim()))
await writeFile(path.join(output, 'package.json'), JSON.stringify({ private: true, type: 'module', main: 'main/index.js' })+'\n')
console.log('Built the synthetic annotation fixture. No product backend is present.')
