import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyRemoteInstall, collectRemotePackages, modMatchesRemote, remoteIdentityFromCatalog, remoteModKey } from '../../src/lib/remoteInstallState.ts'
import type { Mod } from '../../src/types'

function mod(id: string, refs?: Mod['externalReferences']): Pick<Mod, 'id' | 'externalReferences'> {
  return { id, externalReferences: refs }
}

test('remoteModKey : provider:modId, avec fileId en suffixe (spec §16)', () => {
  assert.equal(remoteModKey('gamebanana', '123'), 'gamebanana:123')
  assert.equal(remoteModKey('nexus', '456', '789'), 'nexus:456:789')
})

test('remoteIdentityFromCatalog : modId numérique prioritaire, sinon id (spec §21)', () => {
  assert.deepEqual(remoteIdentityFromCatalog('gamebanana', 'carte-1', 42), { provider: 'gamebanana', remoteModId: '42' })
  assert.deepEqual(remoteIdentityFromCatalog('nexus', 'carte-2', undefined), { provider: 'nexus', remoteModId: 'carte-2' })
})

test('modMatchesRemote : référence confirmée correspondante (spec §16)', () => {
  const m = mod('pkg-1', [{ provider: 'gamebanana', modId: '42', sourceUrl: 'x', confidence: 'exact', confirmedByUser: true }])
  assert.equal(modMatchesRemote(m, { provider: 'gamebanana', remoteModId: '42' }), true)
  assert.equal(modMatchesRemote(m, { provider: 'nexus', remoteModId: '42' }), false)
  assert.equal(modMatchesRemote(m, { provider: 'gamebanana', remoteModId: '43' }), false)
})

test('collectRemotePackages : état canonique dérivé des mods locaux (spec §16)', () => {
  const mods = [
    mod('pkg-a', [{ provider: 'gamebanana', modId: '42', sourceUrl: 'x', confidence: 'exact', confirmedByUser: true }]),
    mod('pkg-b', [{ provider: 'gamebanana', modId: '42', sourceUrl: 'x', confidence: 'exact', confirmedByUser: true }]),
    mod('pkg-c', [{ provider: 'nexus', modId: '7', sourceUrl: 'x', confidence: 'high', confirmedByUser: false }]),
    mod('pkg-d', []),
  ]
  const map = collectRemotePackages(mods)
  assert.deepEqual(map.get('gamebanana:42'), ['pkg-a', 'pkg-b'])
  // haute confiance non confirmée → pas comptée (jamais de devinette)
  assert.equal(map.get('nexus:7'), undefined)
})

test('classifyRemoteInstall : Install / Installé / Installation… / Suppression… (spec §21)', () => {
  assert.equal(classifyRemoteInstall(false, false, false), 'install')
  assert.equal(classifyRemoteInstall(true, false, false), 'installed')
  assert.equal(classifyRemoteInstall(false, true, false), 'installing')
  assert.equal(classifyRemoteInstall(true, true, false), 'installing')
  assert.equal(classifyRemoteInstall(true, false, true), 'removing')
})
