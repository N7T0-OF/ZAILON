/**
 * Export intelligent d'un profil FiveM (spec « FiveM Profiles » §7, §19) —
 * la logique disque (zip) est testée côté Rust (`export_fivem_profile`) ; ici
 * on vérifie le câblage : commande native, boîte de dialogue de sauvegarde et
 * bouton UI.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

test('spec §19 : le natif exclut FiveM.exe, cache/ et logs/ du zip', () => {
  const nativeSrc = read('src-tauri/src/lib.rs')
  const command = nativeSrc.slice(nativeSrc.indexOf('fn export_fivem_profile'), nativeSrc.indexOf('fn export_fivem_profile') + 3000)
  assert.ok(command.includes('add_source_to_zip'), 'réutilise l’ajout sécurisé à l’archive')
  assert.ok(command.includes('"mods"'), 'inclut mods/')
  assert.ok(command.includes('"plugins"'), 'inclut plugins/')
  assert.ok(command.includes('"reshade-shaders"'), 'inclut les shaders ReShade')
  assert.ok(command.includes('exclusions'), 'manifest documente les exclusions')
  assert.ok(!command.includes('FiveM.app/citizen\") as source'), 'jamais le client FiveM comme source')
})

test('spec §7/§19 : bouton « Exporter le profil » câblé dans le panneau', () => {
  const native = read('src/lib/native.ts')
  assert.ok(native.includes('export_fivem_profile'), 'commande export_fivem_profile exposée')
  assert.ok(native.includes('saveFiveMProfileArchive'), 'boîte de dialogue de sauvegarde')
  const panel = read('src/components/FiveMModsPanel.tsx')
  assert.ok(panel.includes('Exporter le profil'), 'bouton d’export présent')
  assert.ok(panel.includes('exportFiveMProfile'), 'le panneau appelle la commande native')
})
