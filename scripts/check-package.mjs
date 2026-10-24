import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFile(path.join(root, relative))
const json = async relative => {
  const source = await read(relative)
  try { return JSON.parse(source.toString('utf8')) }
  catch (cause) { throw new Error(`Invalid JSON in ${relative}`, { cause }) }
}
const sha = value => createHash('sha256').update(value).digest('hex')
const integrity = await json('design/integrity.json')
for (const [file, hash] of Object.entries(integrity.files)) assert.equal(sha(await read(file)), hash, `Changed fixed resource: ${file}`)
const upstream = integrity.upstreamPicker
assert.equal((await json('node_modules/pi-annotate/package.json')).version, upstream.version)
assert.equal(sha(await read(upstream.file)), upstream.sha256, 'Changed upstream picker')
const legacy = await json('tests/fixtures/legacy-synthetic-catalog.json')
const sample = await json('tests/fixtures/sample-synthetic-states.json')
const catalog = await json('scripts/electron-annotations/synthetic-states.json')
assert.equal(legacy.states.length, integrity.legacyStates)
assert.equal(legacy.controls.length, integrity.legacyControls)
assert.deepEqual(catalog.states, [...new Set([...legacy.states, ...sample.states])].sort())
assert.deepEqual(catalog.controls, [...new Set([...legacy.controls, ...sample.controls])].sort())
for (const [file, hash] of Object.entries(sample.sourceFiles)) assert.equal(sha(await read(file)), hash, `Sample needs fresh calibration: ${file}`)
const manifest = await json('package.json')
assert.deepEqual(manifest.pi.extensions, ['./extensions/annotate-electron.ts'])
for (const name of ['@earendil-works/pi-ai','@earendil-works/pi-coding-agent','typebox']) {
  assert.ok(manifest.peerDependencies[name])
  assert.equal(manifest.dependencies[name], undefined, 'Host SDK must not become a runtime dependency')
}
const lock = await json('package-lock.json')
for (const [location, value] of Object.entries(lock.packages)) {
  const name = location.split('node_modules/').at(-1)
  if (name.startsWith('@earendil-works/')) assert.equal(value.version, '1.1.0', `Incompatible local SDK family: ${location}`)
}
const files = []
async function scan(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    assert.ok(!entry.isSymbolicLink(), 'Source must not depend on another checkout through a symlink')
    if (entry.isDirectory()) await scan(file)
    else if (/\.[cm]?[jt]sx?$/.test(file)) files.push(file)
  }
}
for (const directory of ['extensions','scripts','tests','fixtures']) await scan(path.join(root, directory))
let imports = 0
async function localImport(file, specifier) {
  if (!specifier.startsWith('.')) return
  const target = path.resolve(path.dirname(file), specifier)
  assert.ok(target.startsWith(root + path.sep), `Import leaves package: ${specifier}`)
  const candidates = [target, ...['.ts','.tsx','.js','.mjs','.cjs','.d.ts','.d.mts','.d.cts'].map(ext => target+ext), path.join(target, 'index.ts'), path.join(target, 'index.js')]
  const stats = await Promise.all(candidates.map(candidate => fs.stat(candidate).catch(() => null)))
  assert.ok(stats.some(stat => stat?.isFile()), `Missing package import in ${path.relative(root,file)}: ${specifier}`)
  imports++
}
for (const file of files) {
  const source = await fs.readFile(file, 'utf8')
  assert.ok(!/Workspace\/cnc-mendix-agent|\.pi\/npm\/node_modules|experiments\/openchamber-visual-shell|(?:\.\.\/)+src\/main\//.test(source), `Former host dependency: ${path.relative(root,file)}`)
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const work = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) work.push(localImport(file, node.moduleSpecifier.text))
    if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) work.push(localImport(file, node.arguments[0].text))
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  await Promise.all(work)
}
console.log(`Verified ${Object.keys(integrity.files).length} fixed resources, frozen legacy/sample catalogs, local SDK family, and ${imports} relative imports in ${files.length} source files.`)
