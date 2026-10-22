import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

// Keep this import in a native module: Pi's TypeScript loader can cache .mjs imports.
export async function loadDevelopmentAdapter() {
  const url = new URL('./adapter.mjs', import.meta.url)
  const version = createHash('sha256').update(await readFile(url)).digest('hex')
  url.searchParams.set('source', version)
  return import(url.href)
}
