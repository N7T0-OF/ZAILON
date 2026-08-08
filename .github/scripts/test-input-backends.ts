// Tests unitaires de l'architecture GameInputBackend (Phase 6).
// Exécutés par Node 24 (type stripping natif) : aucun framework, aucune dépendance.
//   node --test .github/scripts/test-input-backends.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BACKEND_PRIORITY, detectAntiCheat, inputDiagnosticRows, INPUT_BACKENDS, isNte, planInputBackend } from '../../src/lib/inputBackends.ts'
import { adapterFor, defaultAdapterFor, isLauncherBased } from '../../src/lib/launchAdapters.ts'
import type { Game, GameInputProfile } from '../../src/types.ts'

const game = (name: string): Game => ({
  id: name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  installedMods: [],
  profiles: [],
  totalPlaytime: 0,
} as Game)

const withMapping = (source: Game): Game => {
  const profile: GameInputProfile = {
    id: 'p-test',
    gameId: source.id,
    name: 'Clavier test',
    layout: 'azerty',
    mapping: [{ from: 'Z', to: 'W' }, { from: 'Q', to: 'A' }, { from: 'W', to: 'Z' }, { from: 'A', to: 'Q' }],
    enabled: true,
    activationMode: 'while-playing',
    restoreOnExit: true,
    createdAt: 0,
    updatedAt: 0,
  }
  return { ...source, keyboardProfiles: [profile] }
}

test('ordre de priorité des backends stable', () => {
  assert.deepEqual(BACKEND_PRIORITY, ['native-binding', 'window-layout', 'scoped-remap', 'steam-input', 'unsupported'])
})

test('registre : 5 backends avec métadonnées de sécurité', () => {
  assert.equal(Object.keys(INPUT_BACKENDS).length, 5)
  for (const backend of Object.values(INPUT_BACKENDS)) {
    assert.equal(backend.requiresInjection, false)
    assert.equal(backend.requiresDriver, false)
    assert.equal(backend.requiresProcessWrite, false)
    if (backend.id === 'native-binding') assert.equal(backend.safeWithAntiCheat, false)
    if (backend.id === 'scoped-remap') assert.equal(backend.touchesDesktop, false)
  }
})

test('jeu générique : bindings natifs choisis, aucune contrainte', () => {
  const plan = planInputBackend(withMapping(game('Cyberpunk 2077')), 'qwerty')
  assert.equal(plan.chosen, 'native-binding')
  assert.equal(plan.antiCheat.detected, false)
  assert.ok(plan.chain.every(item => item.available))
})

test('NTE avec mapping : remap fenêtre choisi, ACE détecté, autres bloqués', () => {
  const plan = planInputBackend(withMapping(game('Neverness to Everness')), 'qwerty')
  assert.equal(plan.antiCheat.detected, true)
  assert.equal(plan.antiCheat.name, 'Anti-Cheat Expert')
  assert.equal(plan.chosen, 'scoped-remap')
  assert.equal(plan.chain.find(item => item.backend.id === 'native-binding')?.available, false)
  assert.equal(plan.chain.find(item => item.backend.id === 'window-layout')?.available, false)
  assert.equal(plan.chain.find(item => item.backend.id === 'steam-input')?.available, false)
  assert.equal(plan.chain.find(item => item.backend.id === 'scoped-remap')?.available, true)
})

test('NTE sans traduction active : repli sur aucune méthode', () => {
  const plan = planInputBackend(game('Neverness to Everness'), 'qwerty')
  assert.equal(plan.chosen, 'unsupported')
})

test('diagnostic NTE : ACE oui, injection non, driver non, langue Windows non', () => {
  const rows = inputDiagnosticRows(withMapping(game('Neverness to Everness')), 'qwerty')
  assert.equal(rows.find(row => row.label === 'ACE détecté')?.value, 'Anti-Cheat Expert')
  assert.equal(rows.find(row => row.label === 'Injection')?.value, 'non')
  assert.equal(rows.find(row => row.label === 'Driver')?.value, 'non')
  assert.equal(rows.find(row => row.label === 'Langue Windows ajoutée')?.value, 'non')
})

test('adaptateurs de lancement : NTE launcher, Cyberpunk direct, repli', () => {
  assert.equal(defaultAdapterFor('Neverness to Everness').launchBehavior, 'SteamLauncher')
  assert.equal(defaultAdapterFor('Cyberpunk 2077').launchBehavior, 'DirectProcess')
  assert.equal(defaultAdapterFor('FiveM').launchBehavior, 'ExternalLauncher')
  assert.equal(defaultAdapterFor('Jeu inconnu').launchBehavior, 'DirectProcess')
  assert.equal(adapterFor(game('Neverness to Everness')).launcherExecutable, 'NTELauncher.exe')
  assert.equal(isLauncherBased(adapterFor(game('Neverness to Everness'))), true)
  assert.equal(isLauncherBased(adapterFor(game('Cyberpunk 2077'))), false)
})

test('isNte / detectAntiCheat (lecture seule)', () => {
  assert.equal(isNte('Neverness to Everness'), true)
  assert.equal(isNte('Cyberpunk 2077'), false)
  assert.equal(detectAntiCheat('Neverness to Everness')?.name, 'Anti-Cheat Expert')
  assert.deepEqual(detectAntiCheat('Cyberpunk 2077'), { detected: false })
})
