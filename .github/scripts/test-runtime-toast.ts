import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRuntimeToastContent, isPartialConnection, runtimeBadges, SHORTCUT_HINT_LIMIT } from '../../src/lib/runtimeToast.ts'
import type { Game, GameSession } from '../../src/types'

const session = (overrides: Partial<GameSession> = {}): GameSession => ({
  id: 's1',
  gameId: 'g1',
  profileId: 'p1',
  launchStrategy: 'direct',
  launcherProcessIds: [],
  gameProcessIds: [42],
  startedAt: 0,
  state: 'GameRunning',
  runtimeToolsActive: false,
  deploymentActive: false,
  inputProfileActive: false,
  visualProfileActive: false,
  source: 'zailon',
  timeline: [],
  ...overrides,
})

const game = (overrides: Partial<Game> = {}): Game => ({
  id: 'g1',
  name: 'Cyberpunk 2077',
  execPath: 'C:/game/game.exe',
  modsPath: 'C:/game/mods',
  installedMods: [],
  profiles: [],
  itemKind: 'game',
  ...overrides,
})

test('badges uniquement pour les fonctions réellement actives (spec §19)', () => {
  const badges = runtimeBadges(session({ inputProfileActive: true, visualProfileActive: true }))
  assert.deepEqual(badges.map(badge => badge.label), ['QWERTY', 'Visuel'])
  assert.ok(badges.every(badge => badge.ok))
})

test('aucun badge si aucune fonction active (spec §19)', () => {
  assert.deepEqual(runtimeBadges(session()), [])
})

test('badge Mods seulement si runtimeToolsActive (jamais configuré mais inactif)', () => {
  assert.deepEqual(runtimeBadges(session({ runtimeToolsActive: true })).map(badge => badge.label), ['Mods'])
})

test('connexion partielle : une fonction active, une absente (spec §5)', () => {
  const partial = session({ inputProfileActive: true })
  assert.equal(isPartialConnection(partial, true), true)
})

test('connexion complète : pas de warning', () => {
  const full = session({ inputProfileActive: true, visualProfileActive: true, runtimeToolsActive: true })
  assert.equal(isPartialConnection(full, true), false)
})

test('aucune connexion : pas de warning (spec §5 — rien à signaler)', () => {
  assert.equal(isPartialConnection(session(), true), false)
})

test('pas de warning pour une application non-jeu (spec §98)', () => {
  const app = session({ inputProfileActive: false, visualProfileActive: false, runtimeToolsActive: false })
  assert.equal(isPartialConnection(app, false), false)
})

test('rappel du raccourci : seulement les 3 premières sessions (spec §42, §63)', () => {
  const content = buildRuntimeToastContent(session(), game(), 0, 'Ctrl+Alt+Z')
  assert.equal(content.shortcutHint, 'Ctrl+Alt+Z · Panneau rapide')
  assert.equal(buildRuntimeToastContent(session(), game(), 2, 'Ctrl+Alt+Z').shortcutHint, 'Ctrl+Alt+Z · Panneau rapide')
  assert.equal(buildRuntimeToastContent(session(), game(), SHORTCUT_HINT_LIMIT, 'Ctrl+Alt+Z').shortcutHint, undefined)
})

test('contenu complet : badges + warning + hint (spec §2)', () => {
  const content = buildRuntimeToastContent(
    session({ inputProfileActive: true, visualProfileActive: true, runtimeToolsActive: true }),
    game(),
    1,
    'Ctrl+Alt+Z',
  )
  assert.equal(content.gameName, 'Cyberpunk 2077')
  assert.equal(content.warning, false)
  assert.equal(content.badges.length, 3)
})

test('connexion partielle visible dans le contenu complet', () => {
  const content = buildRuntimeToastContent(session({ inputProfileActive: true }), game(), 0, 'Ctrl+Alt+Z')
  assert.equal(content.warning, true)
  assert.deepEqual(content.badges.map(badge => badge.label), ['QWERTY'])
})
