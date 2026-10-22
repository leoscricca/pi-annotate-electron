import { readFile, lstat, realpath } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'

// Eligibility only. This function does not delete anything or grant removal authority.
export async function ownedCaptureRemovalCandidates(root, paths, confirmedClose) {
  if (!confirmedClose || !Array.isArray(paths) || paths.length > 1000 || paths.some(path => typeof path !== 'string')) {
    throw new Error('ANNOTATION_REMOVAL_REFUSED')
  }
  const directoryStat = await lstat(join(root, 'captures'))
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || directoryStat.uid !== process.getuid()
    || (directoryStat.mode & 0o777) !== 0o700) throw new Error('ANNOTATION_REMOVAL_REFUSED')
  const directory = await realpath(join(root, 'captures'))
  const requested = paths.map(path => resolve(path))
  if (requested.some(path => dirname(path) !== directory)) throw new Error('ANNOTATION_REMOVAL_REFUSED')
  let lines = ''
  try { lines = await readFile(join(root, 'capture-ledger.jsonl'), 'utf8') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const known = new Set()
  try {
    for (const line of lines.split('\n').filter(Boolean)) {
      const row = JSON.parse(line)
      if (typeof row.path === 'string' && dirname(resolve(row.path)) === directory) known.add(resolve(row.path))
    }
  } catch { throw new Error('ANNOTATION_EVIDENCE_REFUSED') }
  const result = []
  for (const path of requested) {
    if (!known.has(path)) throw new Error('ANNOTATION_REMOVAL_REFUSED')
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600
      || await realpath(path) !== path) throw new Error('ANNOTATION_REMOVAL_REFUSED')
    result.push({ path, bytes: stat.size, removalAuthorized: false })
  }
  return result
}
