/**
 * Tests du comptage unique des mods de profil (spec « une seule source de
 * vérité ») : Accueil, Bibliothèque, Profil, Diagnostic et QuickPanel comptent
 * via `countActiveMods` / `countProfileMods` de profileState — jamais une
 * formule locale. Régression verrouillée : le bug « 0 mods actifs » alors que
 * des mods fonctionnent ne peut pas revenir.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countActiveMods, countProfileMods, mergeModCatalogs, reconcileModStates } from '../../src/lib/profileState.ts'
import type { Game, Mod, Profile } from '../../src/types/index.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

const mod = (id: string, name: string, enabled = true): Mod => ({ id, name, enabled, autoUpdate: false } as unknown as Mod)

const gameWith = (installed: Mod[]): Game => ({ id: 'g1', name: 'Test', installedMods: installed, profiles: [], totalPlaytime: 0 } as unknown as Game)

const profileWith = (modStates: Profile['modStates']): Profile => ({ id: 'p1', name: 'Default', modStates } as unknown as Profile)

test('countActiveMods : seuls les mods activés comptent', () => {
  assert.equal(countActiveMods([mod('a', 'A', true), mod('b', 'B', false), mod('c', 'C', true)]), 2)
  assert.equal(countActiveMods([]), 0)
  assert.equal(countActiveMods([mod('a', 'A', false)]), 0)
})

test('countProfileMods : référencé = actif + désactivé (une seule passe)', () => {
  const counts = countProfileMods([mod('a', 'A', true), mod('b', 'B', false), mod('c', 'C', true)])
  assert.equal(counts.referenced, 3)
  assert.equal(counts.active, 2)
  assert.equal(counts.disabled, 1)
  assert.equal(counts.referenced, counts.active + counts.disabled)
})

test('countProfileMods : profil vide → 0 partout', () => {
  assert.deepEqual(countProfileMods([]), { referenced: 0, active: 0, disabled: 0 })
})

// Régression du bug « 0 mods actifs » : un profil référence des ids absents de
// la liste installée (ré-imports MO2, cache périmé) — la résolution ne les
// fait pas disparaître, le compteur ne retombe jamais à 0 par erreur.
test('résolution : ids ré-importés hors catalogue conservés → compteur correct', () => {
  const game = gameWith([mod('installed-1', 'Installé 1', true)])
  const profile = profileWith({ 'installed-1': { enabled: true }, 'reimported-2': { enabled: true } })
  const resolved = reconcileModStates(mergeModCatalogs(game.installedMods, profile.mods || []), profile.modStates || {})
  assert.equal(countActiveMods(resolved), 2)
  assert.equal(countProfileMods(resolved).referenced, 2)
})

test('câblage : tous les écrans passent par profileState, plus aucune formule locale', () => {
  for (const file of ['src/components/Views/HomeView.tsx', 'src/components/Views/GamesView.tsx', 'src/components/Views/GameConfigurationPanel.tsx', 'src/components/Views/GameDiagnosticPanel.tsx', 'src/App.tsx']) {
    const source = read(file)
    assert.ok(source.includes("profileState"), `${file} importe le compteur de profileState`)
    assert.ok(!source.includes('filter(mod => mod.enabled).length'), `${file} : aucun compteur « mods actifs » calculé localement`)
  }
})
