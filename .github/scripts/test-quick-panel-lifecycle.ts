/**
 * Tests du cycle de vie du Quick Game Panel (spec §3, §5-6, §9) — verrouille
 * les régressions « fenêtre blanche » (montré avant que le WebView soit prêt)
 * et « fermeture impossible » (destruction + recréation en boucle).
 *
 * La géométrie (coin supérieur droit, marge 20 px) est testée côté Rust
 * (`top_right_position`). Ici : le câblage frontend ↔ natif.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

test('spec §5 : le bouton × du panneau MASQUE (hide), ne détruit jamais', () => {
  const panel = read('src/components/QuickPanel.tsx')
  assert.ok(panel.includes('native.quickPanel.hide()'), 'la fermeture passe par hide_quick_panel')
  assert.ok(!panel.includes("getCurrentWindow().close()"), 'plus aucune destruction de la fenêtre depuis le panneau')
})

test('spec §3 : la fenêtre est créée CACHÉE et montrée quand le WebView est prêt', () => {
  const rust = read('src-tauri/src/quick_panel.rs')
  assert.ok(rust.includes('.visible(false)'), 'la fenêtre est créée cachée (jamais de fenêtre blanche)')
  assert.ok(rust.includes('PageLoadEvent::Finished'), 'l’affichage attend la fin du chargement du WebView')
  assert.ok(rust.includes('quick-panel-ready'), 'le signal frontend « React monté » déclenche l’affichage')
})

test('spec §5 : la fermeture native est un hide, pas un close — et hide_quick_panel est exposée', () => {
  const rust = read('src-tauri/src/quick_panel.rs')
  const closeCount = (rust.match(/\.close\(\)/g) || []).length
  assert.equal(closeCount, 0, 'aucune destruction de la fenêtre dans le cycle de vie (close_handle.close supprimé)')
  assert.ok(rust.includes('close_handle.hide()'), 'perte de focus → hide')
  assert.ok(rust.includes('pub fn hide_quick_panel'), 'commande hide_quick_panel déclarée')
  const handler = read('src-tauri/src/lib.rs')
  assert.ok(handler.includes('quick_panel::hide_quick_panel'), 'hide_quick_panel enregistrée dans l’invoke_handler')
  const native = read('src/lib/native.ts')
  assert.ok(native.includes("'hide_quick_panel'"), 'binding frontend hide_quick_panel')
})

test('spec §9 : position calculée en coin supérieur droit (marge 20 px), jamais négative', () => {
  const rust = read('src-tauri/src/quick_panel.rs')
  assert.ok(rust.includes('top_right_position'), 'la position est un helper pur testé côté Rust')
  assert.ok(rust.includes('MARGIN: i32 = 20'), 'marge de 20 px conforme à la spec')
  assert.ok(rust.includes('saturating_sub'), 'jamais de position négative (écran plus petit que le panneau)')
})
