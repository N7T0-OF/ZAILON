/**
 * Tests de la logique PURE du contenu réel de `FiveM.app/mods` (spec « FiveM
 * Profiles » §2, §12) : diff ajouté/supprimé/modifié et formatage. La lecture
 * disque et la suppression sécurisée sont testées côté Rust
 * (`list_fivem_mods`, `remove_fivem_mod`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  diffFiveMMods,
  fiveMModKey,
  fiveMModLabel,
  formatFiveMSize,
} from '../../src/lib/fivemMods.ts'
import type { FiveMModEntry } from '../../src/lib/native.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

const entry = (name: string, kind: 'folder' | 'file', sizeBytes: number, modifiedAt: number): FiveMModEntry => ({
  name,
  kind,
  sizeBytes,
  fileCount: kind === 'folder' ? 3 : 1,
  modifiedAt,
  relativePath: name,
})

test('fiveMModKey : type + chemin relatif, stable', () => {
  assert.equal(fiveMModKey(entry('VisualPack', 'folder', 1, 1)), 'folder:VisualPack')
  assert.equal(fiveMModKey(entry('a.txt', 'file', 1, 1)), 'file:a.txt')
})

test('diffFiveMMods : détecte ajout, retrait et modification', () => {
  const before = [entry('VisualPack', 'folder', 100, 10), entry('loose.txt', 'file', 2, 10)]
  const after = [entry('VisualPack', 'folder', 100, 10), entry('loose.txt', 'file', 5, 10), entry('Roads', 'folder', 40, 20)]
  const diff = diffFiveMMods(before, after)
  assert.deepEqual(diff.added, ['folder:Roads'])
  assert.deepEqual(diff.removed, [])
  assert.deepEqual(diff.modified, ['file:loose.txt'])
  assert.equal(diff.changes['folder:VisualPack'], 'unchanged')
})

test('diffFiveMMods : retrait détecté quand une entrée disparaît', () => {
  const before = [entry('A', 'file', 1, 1), entry('B', 'file', 1, 1)]
  const after = [entry('A', 'file', 1, 1)]
  const diff = diffFiveMMods(before, after)
  assert.deepEqual(diff.removed, ['file:B'])
})

test('formatFiveMSize : unités françaises', () => {
  assert.equal(formatFiveMSize(0), '0 o')
  assert.equal(formatFiveMSize(512), '512 o')
  assert.equal(formatFiveMSize(428 * 1024 * 1024), '428 Mo')
  assert.equal(formatFiveMSize(Math.round(2.4 * 1024 * 1024 * 1024)), '2,4 Go')
})

test('fiveMModLabel : dossier = nombre de fichiers, fichier = nom seul', () => {
  assert.equal(fiveMModLabel(entry('VisualPack', 'folder', 1, 1)), 'VisualPack/ · 3 fichiers')
  assert.equal(fiveMModLabel(entry('a.txt', 'file', 1, 1)), 'a.txt')
})

test('spec §1-2, §11-12 : le panneau liste le contenu réel et la commande indexe', () => {
  const native = read('src/lib/native.ts')
  assert.ok(native.includes('list_fivem_mods'), 'commande list_fivem_mods exposée')
  assert.ok(native.includes('remove_fivem_mod'), 'suppression sécurisée exposée')
  const store = read('src/store/useStore.ts')
  assert.ok(store.includes('fiveMModsIndex'), 'index FiveM persisté')
  assert.ok(store.includes('cached?.fingerprint'), 'l’empreinte en cache est réutilisée')
  assert.ok(store.includes('!listing.changed && cached'), 'le re-listing est sauté quand l’empreinte est inchangée')
  const panel = read('src/components/FiveMModsPanel.tsx')
  assert.ok(panel.includes('Contenu de FiveM.app/mods'), 'panneau du contenu réel')
  assert.ok(panel.includes('removeFiveMMod'), 'suppression limitée aux éléments de premier niveau')
})
