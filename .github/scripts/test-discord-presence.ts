import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDiscordActivity,
  buildDiscordState,
  DISCORD_APPLICATION_ID,
  DISCORD_FALLBACK_ASSET,
  modCountIsUncertain,
  shouldDelayPrioritySwitch,
  type DiscordActivityInput,
} from '../../src/lib/discordPresence.ts'

const input = (overrides: Partial<DiscordActivityInput> = {}): DiscordActivityInput => ({
  gameName: 'Cyberpunk 2077',
  gameKind: 'game',
  profileName: 'Default',
  enabledModCount: 84,
  referencedModCount: 84,
  showProfile: true,
  showModCount: true,
  showElapsed: true,
  minimal: false,
  largeImageKey: undefined,
  ...overrides,
})

test('Application ID ZAILON centralisé (spec §5)', () => {
  assert.equal(DISCORD_APPLICATION_ID, '1509971526987022497')
})

test('state jeu avec mods : « Profil X · N mod(s) actif(s) » (spec §8, §25)', () => {
  assert.equal(buildDiscordState(input()), 'Profil Default · 84 mod(s) actif(s)')
})

test('state sans mods : seulement le profil (spec §25)', () => {
  assert.equal(buildDiscordState(input({ enabledModCount: 0, referencedModCount: 0 })), 'Profil Default')
})

test('anti-0-mods : compteur incertain → jamais « 0 mods » (spec §23, §60)', () => {
  const uncertain = input({ enabledModCount: 0, referencedModCount: 84 })
  assert.equal(modCountIsUncertain(uncertain), true)
  assert.equal(buildDiscordState(uncertain), 'Profil Default')
})

test('0 mods réel → « Profil Default », pas « 0 mods » (spec §60)', () => {
  const real = input({ enabledModCount: 0, referencedModCount: 0 })
  assert.equal(modCountIsUncertain(real), false)
  assert.equal(buildDiscordState(real), 'Profil Default')
})

test('application non-jeu sans données : « Session créative » (spec §9-11, §48)', () => {
  assert.equal(buildDiscordState(input({ gameKind: 'software', profileName: undefined, enabledModCount: 0, referencedModCount: 0 })), 'Session créative')
})

test('mode minimal : seulement « Via ZAILON » (spec §36)', () => {
  assert.equal(buildDiscordState(input({ minimal: true })), 'Via ZAILON')
})

test('profil masqué : mods seuls (spec §22)', () => {
  assert.equal(buildDiscordState(input({ showProfile: false })), '84 mod(s) actif(s)')
})

test('mods et profil masqués : fallback « Via ZAILON »', () => {
  assert.equal(buildDiscordState(input({ showProfile: false, showModCount: false })), 'Via ZAILON')
})

test('fallback asset : « zailon » quand aucune clé (spec §50)', () => {
  const activity = buildDiscordActivity(input())
  assert.equal(activity.largeImage, DISCORD_FALLBACK_ASSET)
  assert.equal(activity.smallImage, DISCORD_FALLBACK_ASSET)
  assert.equal(activity.largeImageText, 'Cyberpunk 2077')
})

test('asset spécifique prioritaire sur le fallback (spec §20)', () => {
  const activity = buildDiscordActivity(input({ largeImageKey: 'cyberpunk2077' }))
  assert.equal(activity.largeImage, 'cyberpunk2077')
  assert.equal(activity.largeImageText, 'Cyberpunk 2077')
})

test('première publication : immédiate (spec §15)', () => {
  assert.equal(shouldDelayPrioritySwitch(undefined, 'cyberpunk', false), false)
})

test('même session publiée : aucune bascule (spec §15)', () => {
  assert.equal(shouldDelayPrioritySwitch('cyberpunk', 'cyberpunk', true), false)
})

test('session publiée terminée : remplacement immédiat, pas de délai (spec §13)', () => {
  assert.equal(shouldDelayPrioritySwitch('cyberpunk', 'nte', false), false)
})

test('Alt+Tab (publiée encore active) : bascule différée (spec §15)', () => {
  assert.equal(shouldDelayPrioritySwitch('cyberpunk', 'nte', true), true)
})
