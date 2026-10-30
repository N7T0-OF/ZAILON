// Tests du Last Known Good des frameworks (spec Cyberpunk §41-42).
//   node --test .github/scripts/test-last-known-good.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  compareFrameworkSets,
  fingerprintFrameworkSet,
  fnv1a,
  frameworkNameOf,
  hasFrameworkChanges,
} from '../../src/lib/lastKnownGood.ts'

const mod = (overrides: Partial<{ name: string; enabled: boolean; version?: string; files?: string[]; framework?: string }> = {}) => ({
  name: overrides.name ?? 'Mod',
  enabled: overrides.enabled ?? true,
  version: overrides.version,
  files: overrides.files,
  framework: overrides.framework,
})

test('fnv1a : déterministe et stable', () => {
  assert.equal(fnv1a('red4ext/red4ext.dll'), fnv1a('red4ext/red4ext.dll'))
  assert.equal(fnv1a('a'), fnv1a('a'))
  assert.notEqual(fnv1a('a'), fnv1a('b'))
  assert.match(fnv1a('x'), /^[0-9a-f]{8}$/)
})

test('frameworkNameOf : déclaré gagne, sinon inféré par chemin', () => {
  assert.equal(frameworkNameOf(mod({ framework: 'red4ext' })), 'red4ext')
  assert.equal(frameworkNameOf(mod({ files: ['red4ext/red4ext.dll'] })), 'RED4ext')
  assert.equal(frameworkNameOf(mod({ files: ['engine/tools/scc.exe'] })), 'redscript')
  assert.equal(frameworkNameOf(mod({ files: ['red4ext/plugins/TweakXL/TweakXL.lua'] })), 'TweakXL')
  assert.equal(frameworkNameOf(mod({ files: ['red4ext/plugins/ArchiveXL/init.lua'] })), 'ArchiveXL')
  assert.equal(frameworkNameOf(mod({ files: ['archive/pc/mod.archive'] })), undefined)
})

test('fingerprintFrameworkSet : uniquement les mods actifs, déterministe', () => {
  const set = fingerprintFrameworkSet([
    mod({ name: 'RED4ext', files: ['red4ext/red4ext.dll'], version: '1.25.0' }),
    mod({ name: 'Plugin', files: ['red4ext/plugins/P/init.lua'] }),
    mod({ name: 'Désactivé', enabled: false, files: ['red4ext/red4ext.dll'] }),
    mod({ name: 'Mod normal', files: ['archive/pc/mod.archive'] }),
  ])
  const keys = Object.keys(set)
  assert.deepEqual(keys, ['red4ext']) // l'ordre suit l'insertion, un seul framework
  assert.equal(set.red4ext.version, '1.25.0')
  // Même entrée → même empreinte.
  const again = fingerprintFrameworkSet([
    mod({ name: 'RED4ext', files: ['red4ext/red4ext.dll'], version: '1.25.0' }),
    mod({ name: 'Plugin', files: ['red4ext/plugins/P/init.lua'] }),
  ])
  assert.equal(again.red4ext.fingerprint, set.red4ext.fingerprint)
  // Version différente → empreinte différente.
  const bumped = fingerprintFrameworkSet([
    mod({ name: 'RED4ext', files: ['red4ext/red4ext.dll'], version: '1.26.0' }),
  ])
  assert.notEqual(bumped.red4ext.fingerprint, set.red4ext.fingerprint)
})

test('compareFrameworkSets : ajout, retrait, mise à jour', () => {
  const base = fingerprintFrameworkSet([mod({ name: 'R', files: ['red4ext/red4ext.dll'], version: '1.0.0' })])
  const added = fingerprintFrameworkSet([
    mod({ name: 'R', files: ['red4ext/red4ext.dll'], version: '1.0.0' }),
    mod({ name: 'S', files: ['engine/tools/scc.exe'] }),
  ])
  const removed = fingerprintFrameworkSet([])
  const updated = fingerprintFrameworkSet([mod({ name: 'R', files: ['red4ext/red4ext.dll'], version: '1.1.0' })])

  assert.deepEqual(compareFrameworkSets(base, added).map(c => c.kind), ['added'])
  assert.deepEqual(compareFrameworkSets(base, removed).map(c => c.kind), ['removed'])
  const update = compareFrameworkSets(base, updated)
  assert.deepEqual(update.map(c => c.kind), ['updated'])
  assert.equal(update[0].previousVersion, '1.0.0')
  assert.equal(update[0].currentVersion, '1.1.0')
  assert.deepEqual(compareFrameworkSets(base, base), [])
  assert.deepEqual(compareFrameworkSets(undefined, undefined), [])
})

test('hasFrameworkChanges : vrai si différence, faux si identique ou aucune référence', () => {
  const base = fingerprintFrameworkSet([mod({ name: 'R', files: ['red4ext/red4ext.dll'] })])
  const changed = fingerprintFrameworkSet([mod({ name: 'R', files: ['red4ext/red4ext.dll', 'red4ext/autre.dll'] })])
  assert.equal(hasFrameworkChanges(base, changed), true)
  assert.equal(hasFrameworkChanges(base, base), false)
  // Sans référence antérieure, tout framework actif est un « ajout » — mais le
  // store garde ce cas avec `previous &&` : pas d'avertissement au 1er lancement.
  assert.equal(hasFrameworkChanges(undefined, changed), true)
})
