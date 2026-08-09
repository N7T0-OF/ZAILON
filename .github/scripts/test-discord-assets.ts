import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DISCORD_ASSETS, genericAssetFor, resolveDiscordAsset } from '../../src/lib/discordAssets.ts'

test('mapping static : jeu connu → asset spécifique (spec §19)', () => {
  assert.equal(resolveDiscordAsset('cyberpunk2077', '', 'game'), 'cyberpunk2077')
  assert.equal(resolveDiscordAsset('neverness-to-everness', '', 'game'), 'nte')
  assert.equal(resolveDiscordAsset('photoshop', '', 'software'), 'photoshop')
})

test('jeu absent du mapping : clé globale utilisateur (spec §17.2)', () => {
  assert.equal(resolveDiscordAsset('quelque-jeu', 'mycustomkey', 'game'), 'mycustomkey')
})

test('jeu absent du mapping sans clé globale : asset générique du type (spec §17.3)', () => {
  assert.equal(resolveDiscordAsset('quelque-jeu', '', 'game'), 'generic-game')
  assert.equal(resolveDiscordAsset('blender', '', 'software'), 'blender')
  assert.equal(resolveDiscordAsset('autre-app', '', 'software'), 'generic-app')
})

test('genericAssetFor par type', () => {
  assert.equal(genericAssetFor('game'), 'generic-game')
  assert.equal(genericAssetFor('software'), 'generic-app')
  assert.equal(genericAssetFor(undefined), 'generic-game')
})

test('le mapping est stable (les clés connues existent)', () => {
  assert.equal(DISCORD_ASSETS['cyberpunk2077'], 'cyberpunk2077')
  assert.equal(DISCORD_ASSETS['nte'], 'nte')
  assert.equal(DISCORD_ASSETS['neverness-to-everness'], 'nte')
})
