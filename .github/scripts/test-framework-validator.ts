// Tests du validateur de frameworks pré-lancement + réconciliation du compteur.
//   node --test .github/scripts/test-framework-validator.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isRed4extActive, validateCyberpunkFrameworkDeps } from '../../src/lib/frameworkValidator.ts'
import { mergeModCatalogs, reconcileModStates } from '../../src/lib/profileState.ts'

const mod = (name: string, files: string[], enabled = true) => ({ name, enabled, files })

test('plugins RED4ext sans core → blocage (cause racine du bug)', () => {
  const result = validateCyberpunkFrameworkDeps([
    mod('ArchiveXL', ['red4ext/plugins/ArchiveXL/ArchiveXL.dll']),
    mod('mod CET', ['red4ext/plugins/cyber_engine_tweaks/mods/x.js']),
  ])
  assert.equal(result.valid, false)
  assert.ok(result.blockers.some(blocker => blocker.includes('RED4ext')))
})

test('plugins RED4ext + core fourni par un mod actif → valide', () => {
  const result = validateCyberpunkFrameworkDeps([
    mod('RED4ext', ['red4ext/red4ext.dll', 'red4ext/version.dll']),
    mod('mod plugin', ['red4ext/plugins/foo/main.js']),
  ])
  assert.equal(result.valid, true)
  assert.deepEqual(result.blockers, [])
})

test('core déjà présent sur disque (onDisk) → pas de blocage', () => {
  const result = validateCyberpunkFrameworkDeps(
    [mod('plugin sans core', ['red4ext/plugins/foo/x.js'])],
    relative => relative === 'red4ext/red4ext.dll',
  )
  assert.equal(result.valid, true)
})

test('redscript r6/scripts sans compilateur → blocage', () => {
  const result = validateCyberpunkFrameworkDeps([mod('script mod', ['r6/scripts/foo/bar.reds'])])
  assert.ok(result.blockers.some(blocker => blocker.includes('redscript')))
})

test('r6/tweaks exige TweakXL, .xl exige ArchiveXL', () => {
  const tweaks = validateCyberpunkFrameworkDeps([mod('tweak', ['r6/tweaks/foo.yaml'])])
  assert.ok(tweaks.blockers.some(blocker => blocker.includes('TweakXL')))
  const xl = validateCyberpunkFrameworkDeps([mod('archive', ['archive/pc/mod/foo.archive.xl'])])
  assert.ok(xl.blockers.some(blocker => blocker.includes('ArchiveXL')))
})

test('mods désactivés ne comptent pas comme fournisseurs', () => {
  const result = validateCyberpunkFrameworkDeps([
    mod('RED4ext (désactivé)', ['red4ext/red4ext.dll'], false),
    mod('plugin', ['red4ext/plugins/foo/main.js']),
  ])
  assert.equal(result.valid, false)
})

// --- Réconciliation du compteur (resolveProfileMods) ---

test('isRed4extActive : loader actif via fichiers red4ext/ ou framework déclaré', () => {
  const core = { name: 'RED4ext', enabled: true, files: ['red4ext/red4ext.dll'], framework: 'red4ext' }
  const disabled = { name: 'RED4ext (désactivé)', enabled: false, files: ['red4ext/red4ext.dll'] }
  const plugin = { name: 'Plugin', enabled: true, files: ['red4ext/plugins/Plugin/init.lua'] }
  const unrelated = { name: 'Mod', enabled: true, files: ['archive/pc/mod.archive'] }
  assert.equal(isRed4extActive([core]), true) // core explicite
  assert.equal(isRed4extActive([plugin]), true) // fichiers sous red4ext/
  assert.equal(isRed4extActive([disabled]), false) // désactivé → pas actif
  assert.equal(isRed4extActive([unrelated]), false) // aucun lien RED4ext
  assert.equal(isRed4extActive([{ name: 'M', enabled: true, framework: 'RED4ext' }]), true) // déclaration seule
})

test('mergeModCatalogs : union par id, catalogue installé gagne', () => {
  const installed = [{ id: 'a', name: 'A installé', files: ['x'] }]
  const profile = [{ id: 'a', name: 'A profil', files: ['y'] }, { id: 'b', name: 'B', files: ['z'] }]
  const merged = mergeModCatalogs(installed as never, profile as never)
  assert.deepEqual(merged.map(item => item.id), ['a', 'b'])
  assert.equal(merged[0].name, 'A installé') // l'installé gagne
})

test('reconcileModStates : les clés sans catalogue sont conservées (jamais 0)', () => {
  const catalog = [{ id: 'a', name: 'A' }]
  const states = { a: { enabled: true }, ghost: { enabled: true } }
  const reconciled = reconcileModStates(catalog as never, states as never)
  assert.equal(reconciled.length, 2)
  const ghost = reconciled.find(item => item.id === 'ghost')
  assert.ok(ghost)
  assert.equal(ghost?.enabled, true)
})
