import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, realpath, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { ownedCaptureRemovalCandidates } = require('../scripts/electron-annotations/evidence.mjs')

test('removal eligibility requires confirmed closure and an identified owned regular capture', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cnc-annotation-evidence-')))
  await mkdir(join(root, 'captures'), { mode: 0o700 })
  const owned = join(root, 'captures/owned.png'), unrelated = join(root, 'unrelated.txt')
  await writeFile(owned, 'OWNED_SYNTHETIC_BYTES', { mode: 0o600 })
  await writeFile(unrelated, 'UNRELATED_UNCHANGED', { mode: 0o600 })
  await writeFile(join(root, 'capture-ledger.jsonl'), JSON.stringify({ path: owned, state: 'pending' }) + '\n', { mode: 0o600 })
  expect(await ownedCaptureRemovalCandidates(root, [owned], true)).toEqual([{ path: owned, bytes: 21, removalAuthorized: false }])
  await expect(ownedCaptureRemovalCandidates(root, [owned], false)).rejects.toThrow('ANNOTATION_REMOVAL_REFUSED')
  await expect(ownedCaptureRemovalCandidates(root, [unrelated], true)).rejects.toThrow('ANNOTATION_REMOVAL_REFUSED')
  const link = join(root, 'captures/link.png')
  await symlink(unrelated, link)
  await writeFile(join(root, 'capture-ledger.jsonl'), JSON.stringify({ path: link }) + '\n', { flag: 'a', mode: 0o600 })
  await expect(ownedCaptureRemovalCandidates(root, [link], true)).rejects.toThrow('ANNOTATION_REMOVAL_REFUSED')
  expect(await readFile(unrelated, 'utf8')).toBe('UNRELATED_UNCHANGED')
  expect(await readFile(owned, 'utf8')).toBe('OWNED_SYNTHETIC_BYTES')
})
