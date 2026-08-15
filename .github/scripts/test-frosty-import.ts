import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frostyProfileName } from '../../src/lib/frostyImport.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('frostyProfileName : déduit du dossier, dédupliqué face à l’existant', () => {
  assert.equal(frostyProfileName('C:\\Users\\me\\Frosty\\Mods', []), 'Frosty — Mods')
  assert.equal(frostyProfileName('/home/me/.config/Frosty/Mods', []), 'Frosty — Mods')
  assert.equal(frostyProfileName('Mods', []), 'Frosty — Mods')
  assert.equal(frostyProfileName('Mods', ['Frosty — Mods']), 'Frosty — Mods (2)')
  assert.equal(frostyProfileName('Mods', ['frosty — mods', 'Frosty — Mods (2)']), 'Frosty — Mods (3)')
  // chemin sans séparateur ni dossier → repli honnête
  assert.equal(frostyProfileName('', []), 'Frosty — Frosty')
})

test('garde-fou source : import Frosty gated + action store + détection réelle', () => {
  const gamesView = readFileSync(join(root, 'src/components/Views/GamesView.tsx'), 'utf8')
  assert.ok(gamesView.includes('Importer depuis Frosty'), 'bouton présent')
  assert.ok(gamesView.includes('frostyImport && <button'), 'bouton gated par importer.frosty')
  assert.ok(gamesView.includes('frostyAdapterForExecutable'), 'bouton réservé aux jeux Frosty')

  const dialog = readFileSync(join(root, 'src/components/FrostyImportDialog.tsx'), 'utf8')
  assert.ok(dialog.includes('detectFrostyInstallation'), 'détection réelle du dossier de mods .fbmod')
  assert.ok(dialog.includes('importFrostyInstallation'), 'import via l\'action store dédiée')

  const store = readFileSync(join(root, 'src/store/useStore.ts'), 'utf8')
  assert.ok(store.includes('importFrostyInstallation: (gameId: string, extraPaths: string[])'), 'action store déclarée')
  assert.ok(store.includes('frostyImportAllowed(addonCapabilities(get().addons))'), 'refus sans la capacité')
  assert.ok(store.includes('sourceProvider: \'frosty\''), 'références marquées frosty')

  const gating = readFileSync(join(root, 'src/lib/addonGating.ts'), 'utf8')
  assert.ok(gating.includes("hasCapability(capabilities, 'importer.frosty')"), 'gate pure importer.frosty')
})
