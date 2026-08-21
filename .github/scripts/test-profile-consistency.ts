import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  enabledCountFromState,
  isSilentClear,
  needsStagedRefresh,
  referenceCountFromState,
  repairReport,
} from '../../src/lib/profileConsistency.ts'
import type { Game, Mod, Profile } from '../../src/types'

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  gameId: 'g1',
  name: 'Default',
  modStates: {},
  playtime: 0,
  createdAt: Date.now(),
  ...overrides,
})

const stagedMod = (id: string): Mod => ({
  id,
  name: id,
  path: `staged/${id}/content`,
  enabled: true,
  loader: 'Manual',
  autoUpdate: false,
  source: 'local',
  files: [],
  storage: 'staged',
  stageId: id,
} as Mod)

test('enabledCountFromState compte uniquement les modStates actifs', () => {
  const p = profile({ modStates: { a: { enabled: true, priority: 0 }, b: { enabled: false, priority: 1 }, c: { enabled: true, priority: 2 } } })
  assert.equal(enabledCountFromState(p), 2)
  assert.equal(enabledCountFromState(undefined), 0)
  assert.equal(enabledCountFromState(profile()), 0)
})

test('referenceCountFromState compte les clés de modStates', () => {
  const p = profile({ modStates: { a: { enabled: true, priority: 0 }, b: { enabled: false, priority: 1 } } })
  assert.equal(referenceCountFromState(p), 2)
  assert.equal(referenceCountFromState(profile()), 0)
})

test('isSilentClear — 84 → 0 sans opération explicite est rejeté (spec §8)', () => {
  assert.equal(isSilentClear(84, 0), true)
  assert.equal(isSilentClear(3, 0), true)
})

test('isSilentClear — désactivation massive explicite autorisée', () => {
  assert.equal(isSilentClear(84, 0, { explicitDisableAll: true }), false)
})

test('isSilentClear — suppression explicite de tous les mods autorisée', () => {
  assert.equal(isSilentClear(5, 0, { allowEmpty: true }), false)
})

test('isSilentClear — aucun clear quand le profil était déjà vide', () => {
  assert.equal(isSilentClear(0, 0), false)
  assert.equal(isSilentClear(0, 3), false)
})

test('isSilentClear — aucune réduction partielle ne déclenche le garde', () => {
  assert.equal(isSilentClear(84, 42), false)
})

test('needsStagedRefresh — vrai quand références > 0 mais catalogue vide (spec §9-10)', () => {
  const game = { installedMods: [], profiles: [profile({ modStates: { a: { enabled: true, priority: 0 } } })] } as unknown as Game
  assert.equal(needsStagedRefresh(game), true)
})

test('needsStagedRefresh — faux quand le catalogue est peuplé', () => {
  const game = { installedMods: [stagedMod('a')], profiles: [profile({ modStates: { a: { enabled: true, priority: 0 } } })] } as unknown as Game
  assert.equal(needsStagedRefresh(game), false)
})

test('needsStagedRefresh — faux sans aucune référence', () => {
  assert.equal(needsStagedRefresh({ installedMods: [], profiles: [profile()] } as unknown as Game), false)
  assert.equal(needsStagedRefresh(undefined), false)
})

test('repairReport — signale les références absentes du catalogue', () => {
  const game = {
    installedMods: [stagedMod('a')],
    profiles: [profile({ name: 'Default', modStates: { a: { enabled: true, priority: 0 }, b: { enabled: true, priority: 1 } } })],
  } as unknown as Game
  const report = repairReport(game)
  assert.ok(report)
  assert.equal(report!.profileName, 'Default')
  assert.equal(report!.restoredReferences, 1)
  assert.equal(report!.enabledRestored, 1)
})

test('repairReport — null quand tout est cohérent', () => {
  const game = {
    installedMods: [stagedMod('a')],
    profiles: [profile({ modStates: { a: { enabled: true, priority: 0 } } })],
  } as unknown as Game
  assert.equal(repairReport(game), null)
})
