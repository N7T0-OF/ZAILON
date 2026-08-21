import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lastUsedProfileId, profileBelongsToGame, resolveActiveProfile, resolveGameSessionConfig } from '../../src/lib/perGameConfig.ts'
import { DEFAULT_BACKGROUND_MEDIA_SETTINGS } from '../../src/lib/backgroundMedia.ts'
import type { Game, Profile } from '../../src/types/index.ts'

function makeProfile(over: Partial<Profile>): Profile {
  return { id: 'p', gameId: 'g', name: 'Default', modStates: {}, playtime: 0, createdAt: 0, ...over }
}

function makeGame(over: Partial<Game>): Game {
  return {
    id: 'g',
    name: 'FiveM',
    installedMods: [],
    profiles: [makeProfile({ id: 'p1', name: 'Default', isDefault: true })],
    totalPlaytime: 0,
    ...over,
  }
}

const GLOBAL = { backgroundMedia: DEFAULT_BACKGROUND_MEDIA_SETTINGS, performanceModes: {} }

test('lastUsedProfileId : dernier profil utilisé, jamais profiles[0] brut', () => {
  const profiles = [
    makeProfile({ id: 'p1', name: 'Default', isDefault: true, lastUsed: 100 }),
    makeProfile({ id: 'p2', name: 'Visual', lastUsed: 300 }),
    makeProfile({ id: 'p3', name: 'Roads', lastUsed: 200 }),
  ]
  assert.equal(lastUsedProfileId(profiles), 'p2')
})

test('lastUsedProfileId : sans lastUsed → profil par défaut, puis premier', () => {
  const profiles = [
    makeProfile({ id: 'p1', name: 'First' }),
    makeProfile({ id: 'p2', name: 'Second', isDefault: true }),
  ]
  assert.equal(lastUsedProfileId(profiles), 'p2')
  assert.equal(lastUsedProfileId([makeProfile({ id: 'only', name: 'Only' })]), 'only')
  assert.equal(lastUsedProfileId([]), undefined)
})

test('profileBelongsToGame : garde anti-fuite inter-jeu', () => {
  const game = makeGame({ profiles: [makeProfile({ id: 'a' }), makeProfile({ id: 'b' })] })
  assert.equal(profileBelongsToGame(game, 'a'), true)
  assert.equal(profileBelongsToGame(game, 'x'), false)
  assert.equal(profileBelongsToGame(game, undefined), false)
})

test('resolveActiveProfile : une sélection d\'un AUTRE jeu est ignorée (§4)', () => {
  const game = makeGame({
    profiles: [
      makeProfile({ id: 'a', lastUsed: 50 }),
      makeProfile({ id: 'b', lastUsed: 500 }),
    ],
  })
  // sélection qui appartient au jeu → respectée
  assert.equal(resolveActiveProfile(game, 'a')?.id, 'a')
  // sélection d'un autre jeu → retombe sur le dernier profil utilisé de CE jeu
  assert.equal(resolveActiveProfile(game, 'autre-jeu-profil')?.id, 'b')
})

test('resolveGameSessionConfig : consolide les 3 niveaux sans fuite', () => {
  const game = makeGame({
    name: 'Cyberpunk 2077',
    keyboardLayout: { layout: 'qwerty' } as Game['keyboardLayout'],
    backgroundMedia: { type: 'image', volumeOverride: 0.2, mutedOverride: false },
    profiles: [
      makeProfile({ id: 'p1', name: 'Modded', lastUsed: 900, reshade: { enabled: true, shaderDependencies: [] }, launchArgs: '--skip-launcher', runtime: 'REDprelauncher' }),
    ],
  })
  const config = resolveGameSessionConfig(game, undefined, GLOBAL)
  assert.equal(config.gameName, 'Cyberpunk 2077')
  assert.equal(config.profileId, 'p1')
  assert.equal(config.reshadeEnabled, true)
  assert.equal(config.launchArgs, '--skip-launcher')
  assert.equal(config.runtime, 'REDprelauncher')
  assert.equal(config.performanceMode, 'auto')
  // surcharge par jeu du fond (volume 0.2) — le défaut global est 0.07
  assert.ok(config.backgroundVolume > 0.19)
})

test('resolveGameSessionConfig : profil d\'un autre jeu → jamais accepté', () => {
  const game = makeGame({ profiles: [makeProfile({ id: 'p1', name: 'Vanilla', lastUsed: 10 })] })
  const config = resolveGameSessionConfig(game, 'profil-d-un-autre-jeu', GLOBAL)
  assert.equal(config.profileId, 'p1')
  assert.equal(config.profileName, 'Vanilla')
})

test('garde-fou source : setSelectedGame restaure le dernier profil utilisé (pas profiles[0])', () => {
  const src = readFileSync(join(process.cwd(), 'src/store/useStore.ts'), 'utf8')
  const setSelectedGame = src.match(/setSelectedGame: selectedGameId => \{[\s\S]*?\n  \},/)?.[0] ?? ''
  assert.match(setSelectedGame, /lastUsedProfileId\(game\.profiles\)/)
  assert.doesNotMatch(setSelectedGame, /profiles\[0\]\?\.id/)
})
