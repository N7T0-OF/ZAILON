// Tests du validateur hiérarchique des frameworks Cyberpunk (spec §36-43).
//   node --test .github/scripts/test-framework-hierarchy.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FRAMEWORK_ORDER,
  validateFrameworkHierarchy,
} from '../../src/lib/frameworkHierarchy.ts'
import { fingerprintFrameworkSet } from '../../src/lib/lastKnownGood.ts'

const mod = (name: string, files: string[], enabled = true, version?: string) => ({ name, enabled, files, version })

test('RED4ext manquant = cause primaire ; TweakXL/ArchiveXL deviennent conséquences (spec §43)', () => {
  // r6/tweaks + .xl exigent leurs frameworks, mais RED4ext (leur racine) est
  // absent : on ne doit PAS afficher trois « framework manquant » indépendants.
  const result = validateFrameworkHierarchy([
    mod('mod tweak', ['r6/tweaks/foo.yaml']),
    mod('mod archive', ['archive/pc/mod/foo.archive.xl']),
    mod('TweakXL', ['red4ext/plugins/TweakXL/init.lua']),
  ])
  assert.equal(result.valid, false)
  assert.equal(result.primaryCause?.label, 'RED4ext')
  assert.equal(result.primaryCause?.kind, 'missing')
  // RED4ext d'abord dans l'ordre de vérification (spec §37).
  assert.deepEqual(result.ordered.map(item => item.capability), FRAMEWORK_ORDER)
  // TweakXL est fourni mais devient conséquence : sa propre erreur est masquée.
  const tweakxl = result.ordered.find(item => item.capability === 'cyberpunk.tweakxl')
  assert.equal(tweakxl?.kind, 'consequence')
  assert.equal(tweakxl?.blockedBy, 'RED4ext')
  assert.ok(result.consequences.some(item => item.label === 'TweakXL'))
  assert.ok(result.blockers.some(line => line.includes('RED4ext')))
  assert.ok(result.blockers.some(line => line.includes('Conséquences')))
})

test('Tout en place (RED4ext + TweakXL + ArchiveXL + contenus) → valide', () => {
  const result = validateFrameworkHierarchy([
    mod('RED4ext', ['red4ext/red4ext.dll', 'bin/x64/winmm.dll']),
    mod('TweakXL', ['red4ext/plugins/TweakXL/init.lua', 'red4ext/plugins/TweakXL/TweakXL.dll']),
    mod('ArchiveXL', ['red4ext/plugins/ArchiveXL/ArchiveXL.dll', 'red4ext/plugins/ArchiveXL/init.lua']),
    mod('mod tweak', ['r6/tweaks/foo.yaml']),
    mod('mod archive', ['archive/pc/mod/foo.archive.xl']),
  ])
  assert.equal(result.valid, true)
  assert.equal(result.primaryCause, undefined)
  assert.deepEqual(result.consequences, [])
  // Tout prêt — redscript absent mais non requis par le profil (aucun r6/scripts).
  assert.ok(result.ordered.every(item => item.kind === 'ready' || item.kind === 'absent'))
  assert.equal(result.ordered.find(item => item.capability === 'cyberpunk.redscript')?.kind, 'absent')
})

test('TweakXL fourni par signature seule (dossier mal nommé) → misplaced', () => {
  const result = validateFrameworkHierarchy([
    mod('RED4ext', ['red4ext/red4ext.dll', 'bin/x64/winmm.dll']),
    // Le fichier existe mais pas sous red4ext/plugins/TweakXL/ (spec §31 : la
    // signature détecte la capacité, l'emplacement canonique n'est pas bon).
    mod('TweakXL (flat)', ['red4ext/plugins/tweakxl.dll']),
    mod('mod tweak', ['r6/tweaks/foo.yaml']),
  ])
  assert.equal(result.valid, false)
  assert.equal(result.primaryCause?.label, 'TweakXL')
  assert.equal(result.primaryCause?.kind, 'misplaced')
  assert.ok(result.blockers.some(line => line.includes('mal placé') || line.includes('emplacement canonique')))
})

test('not-deployed : présent dans le profil mais absent de la table virtuelle', () => {
  const result = validateFrameworkHierarchy(
    [
      mod('RED4ext', ['red4ext/red4ext.dll', 'bin/x64/winmm.dll']),
      mod('TweakXL', ['red4ext/plugins/TweakXL/init.lua']),
      mod('mod tweak', ['r6/tweaks/foo.yaml']),
    ],
    { virtualFiles: ['red4ext/red4ext.dll'] }, // TweakXL non projeté
  )
  assert.equal(result.valid, false)
  assert.equal(result.primaryCause?.label, 'TweakXL')
  assert.equal(result.primaryCause?.kind, 'not-deployed')
  // Sans la table virtuelle, le même profil est prêt (l'audit n'était pas fourni).
  const withoutAudit = validateFrameworkHierarchy([
    mod('RED4ext', ['red4ext/red4ext.dll', 'bin/x64/winmm.dll']),
    mod('TweakXL', ['red4ext/plugins/TweakXL/init.lua']),
    mod('mod tweak', ['r6/tweaks/foo.yaml']),
  ])
  assert.equal(withoutAudit.valid, true)
})

test('incompatible : empreinte changée depuis le Last Known Good → avertissement, pas blocage', () => {
  const previous = fingerprintFrameworkSet([
    mod('RED4ext', ['red4ext/red4ext.dll', 'bin/x64/winmm.dll'], true, '1.25.0'),
    mod('TweakXL', ['red4ext/plugins/TweakXL/init.lua'], true, '1.3.0'),
  ])
  const result = validateFrameworkHierarchy(
    [
      mod('RED4ext', ['red4ext/red4ext.dll', 'bin/x64/winmm.dll'], true, '1.26.0'), // version changée
      mod('TweakXL', ['red4ext/plugins/TweakXL/init.lua'], true, '1.3.0'),
    ],
    { previousSnapshot: previous },
  )
  assert.equal(result.valid, true)
  const red4ext = result.ordered.find(item => item.capability === 'cyberpunk.red4ext')
  assert.equal(red4ext?.kind, 'incompatible')
  assert.ok(result.warnings.some(line => line.includes('RED4ext')))
  assert.ok(result.warnings.some(line => line.includes('dernier lancement réussi')))
})

test('ordres : un framework prêt après la cause primaire reste prêt (pas de conséquence inutile)', () => {
  const result = validateFrameworkHierarchy([
    mod('mod archive', ['archive/pc/mod/foo.archive.xl']),
    mod('ArchiveXL', ['red4ext/plugins/ArchiveXL/ArchiveXL.dll']), // présent mais RED4ext absent
    mod('CET', ['bin/x64/plugins/cyber_engine_tweaks.asi', 'bin/x64/version.dll']), // prêt
  ])
  assert.equal(result.primaryCause?.label, 'RED4ext')
  const cet = result.ordered.find(item => item.capability === 'cyberpunk.cet')
  assert.equal(cet?.kind, 'ready')
  assert.ok(!result.consequences.some(item => item.label === 'Cyber Engine Tweaks'))
})
