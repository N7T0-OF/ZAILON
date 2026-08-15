import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveGameIdentity, sameGameIdentity } from '../../src/lib/gameIdentity.ts'

test('provider + AppID = haute confiance, clé stable', () => {
  const id = resolveGameIdentity({ name: 'Cyberpunk 2077', provider: 'steam', providerGameId: '1091500' })
  assert.equal(id.key, 'steam:1091500')
  assert.equal(id.confidence, 'high')
  assert.equal(id.kind, 'game')
  assert.ok(id.signals.includes('providerGameId'))
})

test('exécutable + chemin = confiance moyenne (jamais le seul nom)', () => {
  const id = resolveGameIdentity({ name: 'NTE', execPath: 'C:\\Games\\NTE\\ntegloballauncher.exe', installDirectory: 'C:\\Games\\NTE' })
  assert.equal(id.confidence, 'medium')
  assert.ok(id.signals.includes('execPath'))
  assert.ok(id.signals.includes('installDirectory'))
  assert.equal(id.kind, 'launcher')
})

test('un « launcher.exe » générique n\'est pas confondu avec un jeu', () => {
  const launcher = resolveGameIdentity({ name: 'Whatever', execPath: 'C:\\Tool\\launcher.exe' })
  assert.equal(launcher.kind, 'launcher')
  const game = resolveGameIdentity({ name: 'FiveM', execPath: 'C:\\FiveM\\FiveM.exe', installDirectory: 'C:\\FiveM' })
  assert.equal(game.kind, 'game')
  // Un exécutable seul (sans chemin) reste de type inconnu — faible confiance.
  const bare = resolveGameIdentity({ name: 'FiveM', execPath: 'C:\\FiveM\\FiveM.exe' })
  assert.equal(bare.kind, 'unknown')
  assert.notEqual(launcher.key, game.key)
})

test('nom seul = faible confiance, dernier recours', () => {
  const id = resolveGameIdentity({ name: 'Photoshop' })
  assert.equal(id.confidence, 'low')
  assert.equal(id.key, 'name:photoshop')
})

test('sameGameIdentity : même jeu via des signaux différents (jamais le seul nom)', () => {
  assert.equal(sameGameIdentity(
    { provider: 'steam', providerGameId: '1091500' },
    { name: 'Cyberpunk 2077', execPath: 'C:\\Games\\CP2077\\Cyberpunk2077.exe' },
  ), false) // signaux insuffisants → PAS de fusion abusive
  assert.equal(sameGameIdentity(
    { execPath: 'C:\\FiveM\\FiveM.exe', installDirectory: 'C:\\FiveM' },
    { execPath: 'D:\\FiveM\\FiveM.exe', installDirectory: 'D:\\FiveM' },
  ), false) // chemins différents → deux installations distinctes
  assert.equal(sameGameIdentity(
    { execPath: 'C:\\FiveM\\FiveM.exe', installDirectory: 'C:\\FiveM' },
    { execPath: 'C:\\FiveM\\FiveM.exe', installDirectory: 'c:\\fivem' },
  ), true) // même exécutable + même chemin (casse normalisée)
  assert.equal(sameGameIdentity(
    { provider: 'steam', providerGameId: '1091500' },
    { provider: 'steam', providerGameId: '1091500', name: 'Autre nom' },
  ), true) // même AppID → même jeu, quel que soit le nom
})
