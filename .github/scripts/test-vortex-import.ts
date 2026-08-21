import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseVortexDeployment, vortexDeploymentDigest, vortexModSummaries, vortexProfileName } from '../../src/lib/vortexImport.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const VALID = {
  instance: 'skyrimse',
  version: 1,
  files: [
    { relPath: 'Data\\foo.esp', source: 'mod-a', deploymentMethod: 'hardlink' },
    { relPath: 'Data/bar.esp', source: 'mod-a', deploymentMethod: 'hardlink' },
    { relPath: 'Data/baz.esp', source: 'mod-b', deploymentMethod: 'symlink' },
    { relPath: 'Data\\qux.esp', source: 'mod-b' },
  ],
}

test('parseVortexDeployment : manifeste valide, chemins normalisés', () => {
  const deployment = parseVortexDeployment(VALID)
  assert.ok(deployment)
  assert.equal(deployment.instance, 'skyrimse')
  assert.equal(deployment.version, 1)
  assert.equal(deployment.files.length, 4)
  assert.equal(deployment.files[0].relPath, 'Data/foo.esp') // \\ → /
  assert.equal(deployment.files[1].relPath, 'Data/bar.esp')
})

test('parseVortexDeployment : entrées incomplètes ignorées, manifeste invalide → null', () => {
  assert.equal(parseVortexDeployment(null), null)
  assert.equal(parseVortexDeployment({}), null)
  assert.equal(parseVortexDeployment({ instance: '', files: [] }), null)
  // fichier sans relPath/source → ignoré ; si plus rien de valide → null
  assert.equal(parseVortexDeployment({ instance: 'x', files: [{ source: 'a' }, { relPath: 'b' }] }), null)
})

test('vortexModSummaries : déduplication par source + comptage + méthodes', () => {
  const deployment = parseVortexDeployment(VALID)!
  const mods = vortexModSummaries(deployment)
  assert.equal(mods.length, 2)
  const modA = mods.find(mod => mod.name === 'mod-a')!
  assert.equal(modA.fileCount, 2)
  assert.deepEqual(modA.methods, ['hardlink'])
  const modB = mods.find(mod => mod.name === 'mod-b')!
  assert.equal(modB.fileCount, 2)
  assert.deepEqual(modB.methods, ['symlink'])
})

test('vortexDeploymentDigest : résumé humain', () => {
  const deployment = parseVortexDeployment(VALID)!
  const digest = vortexDeploymentDigest(deployment)
  assert.equal(digest.modCount, 2)
  assert.equal(digest.fileCount, 4)
  assert.deepEqual(digest.methods, ['hardlink', 'symlink'])
})

test('vortexProfileName : base puis suffixé sans conflit', () => {
  assert.equal(vortexProfileName('skyrimse', []), 'Vortex — skyrimse')
  assert.equal(vortexProfileName('skyrimse', ['Vortex — skyrimse']), 'Vortex — skyrimse (2)')
  assert.equal(vortexProfileName('skyrimse', ['vortex — skyrimse', 'Vortex — skyrimse (2)']), 'Vortex — skyrimse (3)')
})

test('garde-fou source : import Vortex gated + action store + détection réelle', () => {
  const gamesView = readFileSync(join(root, 'src/components/Views/GamesView.tsx'), 'utf8')
  assert.ok(gamesView.includes('Importer depuis Vortex'), 'bouton présent')
  assert.ok(gamesView.includes('vortexImport && <button'), 'bouton gated par importer.vortex')

  const dialog = readFileSync(join(root, 'src/components/VortexImportDialog.tsx'), 'utf8')
  assert.ok(dialog.includes('detectVortexInstance'), 'détection réelle vortex.deployment.json')
  assert.ok(dialog.includes('importVortexDeployment'), 'import via l\'action store dédiée')

  const store = readFileSync(join(root, 'src/store/useStore.ts'), 'utf8')
  assert.ok(store.includes('importVortexDeployment: (gameId: string, gameRoot: string)'), 'action store déclarée')
  assert.ok(store.includes('vortexImportAllowed(addonCapabilities(get().addons))'), 'refus sans la capacité')
  assert.ok(store.includes('sourceProvider: \'vortex\''), 'références marquées vortex')

  const gating = readFileSync(join(root, 'src/lib/addonGating.ts'), 'utf8')
  assert.ok(gating.includes("hasCapability(capabilities, 'importer.vortex')"), 'gate pure importer.vortex')
})
