import { lstat, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

// Only private profile material is disposable. Captures, ledgers, and receipts persist.
export async function cleanupClosedSyntheticProfile(root, terminal) {
  if (!terminal || terminal.code !== 0 || terminal.signal !== null || terminal.closeObserved !== true
    || terminal.spawnFailed || terminal.terminationRequested) throw new Error('ANNOTATION_CLEANUP_UNCONFIRMED')
  if (await realpath(root) !== root || !basename(root).startsWith('cnc-codex-desktop-')) throw new Error('ANNOTATION_PROFILE_REFUSED')
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid() || (rootStat.mode & 0o777) !== 0o700) throw new Error('ANNOTATION_PROFILE_REFUSED')
  for (const name of ['home', 'profile', 'tmp']) {
    const directory = join(root, name), stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700
      || await realpath(directory) !== directory) throw new Error('ANNOTATION_PROFILE_REFUSED')
  }
  const markerStat = await lstat(join(root, 'profile/conversation-fixture.json'))
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.uid !== process.getuid() || (markerStat.mode & 0o777) !== 0o600) throw new Error('ANNOTATION_PROFILE_REFUSED')
  let marker
  try { marker = JSON.parse(await readFile(join(root, 'profile/conversation-fixture.json'), 'utf8')) }
  catch { throw new Error('ANNOTATION_PROFILE_REFUSED') }
  if (marker.version !== 1 || marker.suite !== 'synthetic-codex-v1' || marker.home !== join(root, 'home')
    || marker.profile !== join(root, 'profile')) throw new Error('ANNOTATION_PROFILE_REFUSED')
  for (const name of ['home', 'profile', 'tmp']) await rm(join(root, name), { recursive: true })
  await writeFile(join(root, 'profile-cleanup.json'), JSON.stringify({ confirmedChildClose: true, profileRemoved: true, capturesRetained: true }), { mode: 0o600, flag: 'wx' })
  return { profileRemoved: true, capturesRetained: true }
}
