import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFrostyStaging,
  classifyFrostyPackage,
  compareFrostyVersions,
  frostyAdapterForExecutable,
  frostyFingerprintKey,
  frostyFingerprintsEqual,
  frostyOverhaulConflict,
  frostyPlatformStrategy,
  frostyVersionCompatibilityAlert,
  FROSTY_GAME_REGISTRY,
  isFrostyPackageFile,
  loadOrderHintPosition,
  loadOrderSignature,
  reorderFrostyList,
  resolveFrostyVersion,
} from '../../src/lib/frosty.ts'

const nfs = FROSTY_GAME_REGISTRY[0]

test('registre : NFS 2015 détecté par NFS16.exe', () => {
  assert.equal(nfs.gameId, 'nfs-2015')
  assert.equal(nfs.nexusDomain, 'needforspeed2016')
  assert.equal(frostyAdapterForExecutable('C:\\Games\\NFS\\NFS16.exe')?.gameId, 'nfs-2015')
  assert.equal(frostyAdapterForExecutable('NFS16.exe')?.gameId, 'nfs-2015')
  assert.equal(frostyAdapterForExecutable('Cyberpunk2077.exe'), undefined)
})

test('version manager : 1.0.6.3 préférée, jamais latest, 1.0.7 bloquée', () => {
  assert.equal(resolveFrostyVersion(nfs).version, '1.0.6.3')
  assert.equal(resolveFrostyVersion(nfs).reason, 'preferred')
  // La version demandée par le profil est bloquée → retour à la préférée.
  const resolution = resolveFrostyVersion(nfs, '1.0.7.0')
  assert.equal(resolution.version, '1.0.6.3')
  assert.ok(resolution.blockedVersions.includes('1.0.7.0'))
  // Version profil autorisée.
  assert.equal(resolveFrostyVersion(nfs, '1.0.6.2').version, '1.0.6.2')
})

test('alerte de version bloquée (Evolution vs 1.0.7)', () => {
  assert.ok(frostyVersionCompatibilityAlert(nfs, '1.0.7.0')?.includes('déconseillée'))
  assert.equal(frostyVersionCompatibilityAlert(nfs, '1.0.6.3'), undefined)
  assert.ok(frostyVersionCompatibilityAlert(nfs, '1.0.5.0')?.includes('minimum'))
})

test('comparaison de versions 1.0.6.3', () => {
  assert.equal(compareFrostyVersions('1.0.6.3', '1.0.6.3'), 0)
  assert.ok(compareFrostyVersions('1.0.6.3', '1.0.7.0') < 0)
  assert.ok(compareFrostyVersions('1.0.7.0', '1.0.6.3') > 0)
  assert.ok(compareFrostyVersions('1.0.6', '1.0.6.3') < 0)
})

test('inspecteur : .fbmod moderne, archives legacy, jamais traité comme archive générique', () => {
  assert.equal(classifyFrostyPackage('Evolution.fbmod'), 'modern-fbmod')
  assert.equal(classifyFrostyPackage('mods.zip'), 'legacy-structure')
  assert.equal(classifyFrostyPackage('game.pak'), 'unsupported')
  assert.equal(classifyFrostyPackage('textures.rar'), 'legacy-structure')
  assert.equal(classifyFrostyPackage('nope.exe'), 'not-frosty')
  assert.ok(isFrostyPackageFile('a.fbmod'))
  assert.equal(isFrostyPackageFile('a.zip'), false)
})

test('load order : monter, descendre, tout en haut/bas', () => {
  const items = ['a', 'b', 'c', 'd']
  assert.deepEqual(reorderFrostyList(items, 2, 'up'), ['a', 'c', 'b', 'd'])
  assert.deepEqual(reorderFrostyList(items, 1, 'down'), ['a', 'c', 'b', 'd'])
  assert.deepEqual(reorderFrostyList(items, 3, 'top'), ['d', 'a', 'b', 'c'])
  assert.deepEqual(reorderFrostyList(items, 0, 'bottom'), ['b', 'c', 'd', 'a'])
  assert.deepEqual(reorderFrostyList(items, 0, 'up'), items)
  assert.deepEqual(reorderFrostyList(items, -1, 'up'), items)
})

test('hints : « place at bottom » → bas de liste', () => {
  assert.equal(loadOrderHintPosition(['Place at the bottom of the list']), 'bottom')
  assert.equal(loadOrderHintPosition(['Placez tout en bas']), 'bottom')
  assert.equal(loadOrderHintPosition(['Top priority']), 'top')
  assert.equal(loadOrderHintPosition(['Install normally']), 'any')
  assert.equal(loadOrderHintPosition(undefined), 'any')
})

test('plateforme : EA App natif, Steam + DatapathFix, conflit plugins détecté', () => {
  const ea = frostyPlatformStrategy('ea-app', nfs, { datapathFix: false, launchPlatformPlugin: false })
  assert.equal(ea.strategy, 'native')
  assert.equal(ea.datapathFixRecommended, false)
  const steam = frostyPlatformStrategy('steam', nfs, { datapathFix: false, launchPlatformPlugin: false })
  assert.equal(steam.strategy, 'datapath-fix')
  assert.equal(steam.datapathFixRecommended, true)
  const conflict = frostyPlatformStrategy('steam', nfs, { datapathFix: true, launchPlatformPlugin: true })
  assert.equal(conflict.pluginConflict, true)
})

test('conflits overhauls : Evolution + Remastered ensemble', () => {
  assert.ok(frostyOverhaulConflict(['Evolution', 'Harder Cops', 'Remastered'])?.includes('Evolution'))
  assert.equal(frostyOverhaulConflict(['Evolution', 'Harder Cops']), undefined)
  assert.equal(frostyOverhaulConflict([]), undefined)
})

test('fingerprint : stable, change avec l\'ordre ou la version', () => {
  const base = { profileRevision: 3, runtimeVersion: '1.0.6.3', gameVersion: '1.0.0', loadOrderSignature: 'a>b', pluginSignature: 'native' }
  assert.ok(frostyFingerprintsEqual(base, { ...base }))
  assert.equal(frostyFingerprintsEqual(base, { ...base, loadOrderSignature: 'b>a' }), false)
  assert.equal(frostyFingerprintsEqual(base, { ...base, runtimeVersion: '1.0.7.0' }), false)
  assert.ok(frostyFingerprintKey(base).includes('1.0.6.3'))
})

test('staging : ordre respecté, version résolue', () => {
  const staging = buildFrostyStaging(
    [{ modId: 'm1', name: 'Evolution' }, { modId: 'm2', name: 'Audio' }, { modId: 'm3', name: 'Cops' }],
    ['m3', 'm1'],
    nfs,
  )
  assert.deepEqual(staging.loadOrder, ['m3', 'm1', 'm2'])
  assert.deepEqual(staging.packageRefs.map(pkg => pkg.modId), ['m3', 'm1', 'm2'])
  assert.equal(staging.runtimeVersion, '1.0.6.3')
})

test('loadOrderSignature : ordre significatif', () => {
  assert.equal(loadOrderSignature(['a', 'b']), 'a>b')
  assert.equal(loadOrderSignature(['b', 'a']), 'b>a')
})
