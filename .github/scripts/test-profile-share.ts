import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfileShareManifest, computeShareStats, modHasSource, nextProfileName, sanitizeProfileForImport } from '../../src/lib/profileShare.ts'
import type { Game, Mod, Profile } from '../../src/types/index.ts'

function mod(id: string, overrides: Partial<Mod> = {}): Mod {
  return { id, name: id, enabled: true, loader: 'mo2', autoUpdate: false, ...overrides }
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    gameId: 'g1',
    name: 'Default',
    modStates: {},
    playtime: 0,
    createdAt: 1,
    ...overrides,
  }
}

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    name: 'Cyberpunk 2077',
    installedMods: [],
    profiles: [],
    totalPlaytime: 0,
    ...overrides,
  }
}

test('modHasSource : sourceUrl ou références externes', () => {
  assert.ok(modHasSource(mod('a', { sourceUrl: 'https://x.com/mods/1' })))
  assert.ok(modHasSource(mod('b', { externalReferences: [{ provider: 'nexus', modId: 1, fileId: 2 }] })))
  assert.equal(modHasSource(mod('c')), false)
})

test('computeShareStats : reproductibilité 100 % quand tout est récupérable', () => {
  const mods = [
    mod('a', { sourceUrl: 'https://x.com/a' }),
    mod('b', { sourceUrl: 'https://x.com/b', sizeBytes: 10 }),
  ]
  const stats = computeShareStats(mods, 'light')
  assert.equal(stats.totalMods, 2)
  assert.equal(stats.withSource, 2)
  assert.equal(stats.localWithoutSource, 0)
  assert.equal(stats.reproducibility, 100)
  assert.equal(stats.estimatedBytes, 10)
})

test('computeShareStats : mods locaux sans source baissent la reproductibilité en léger', () => {
  const mods = [mod('a', { sourceUrl: 'https://x.com/a' }), mod('b')]
  const light = computeShareStats(mods, 'light')
  assert.equal(light.localWithoutSource, 1)
  assert.equal(light.reproducibility, 50)
  const complete = computeShareStats(mods, 'complete')
  assert.equal(complete.localIncluded, 1)
  assert.equal(complete.reproducibility, 100)
})

test('computeShareStats : profils vides', () => {
  const stats = computeShareStats([], 'light')
  assert.equal(stats.totalMods, 0)
  assert.equal(stats.reproducibility, 100)
})

test('nextProfileName : jamais d\'écrasement, compteur croissant', () => {
  assert.equal(nextProfileName([], 'Default'), 'Default')
  assert.equal(nextProfileName(['Default'], 'Default'), 'Default (2)')
  assert.equal(nextProfileName(['Default', 'Default (2)'], 'Default'), 'Default (3)')
  assert.equal(nextProfileName(['default'], 'Default'), 'Default (2)')
  assert.equal(nextProfileName(['x'], '  '), 'Profil importé')
})

test('buildProfileShareManifest : neutralise les chemins absolus (§45-46)', () => {
  const p = profile({
    directory: 'C:\\Users\\Swann\\AppData\\Roaming\\ZAILON\\profiles\\p1',
    manifestPath: 'C:\\Users\\Swann\\AppData\\Roaming\\ZAILON\\profiles\\p1\\modlist.txt',
    deploymentPath: 'D:\\Games\\Cyberpunk 2077',
    bypass: 'D:\\Games\\Cyberpunk 2077\\Bypass',
    launchArgs: '-force-vulkan',
  })
  const manifest = buildProfileShareManifest({
    game: game(),
    profile: p,
    mods: [mod('a', { path: 'C:\\Staged\\a', sourceUrl: 'https://x.com/a' })],
    mode: 'light',
    appVersion: '1.65.0',
  })
  assert.equal(manifest.profile.directory, 'PROFILE_STORE')
  assert.equal(manifest.profile.deploymentPath, 'GAME_ROOT')
  assert.equal(manifest.profile.bypass, 'GAME_ROOT/Bypass')
  assert.equal(manifest.profile.launchArgs, '-force-vulkan')
  // chemins de mods jamais exportés
  assert.equal(manifest.mods[0].path, undefined)
  assert.equal(manifest.mods[0].files, undefined)
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.app, 'ZAILON')
})

test('buildProfileShareManifest : réglages jeu transportables (§44)', () => {
  const manifest = buildProfileShareManifest({
    game: game({ keyboardLayout: { layout: 'qwerty', enabled: true }, launchAdapter: { launchBehavior: 'MultiStage', gameExecutableCandidates: ['NTE.exe'], launchChainStages: [], reattachWindowSeconds: 30, endGraceSeconds: 10 } }),
    profile: profile(),
    mods: [],
    mode: 'complete',
    appVersion: '1.65.0',
  })
  assert.equal(manifest.game.keyboardLayout?.layout, 'qwerty')
  assert.equal(manifest.game.launchAdapter?.launchBehavior, 'MultiStage')
  assert.equal(manifest.exportMode, 'complete')
})

test('sanitizeProfileForImport : supprime les chemins machine', () => {
  const p = profile({
    directory: 'C:\\Users\\Swann\\...',
    bypass: 'C:\\Games\\Bypass',
    clonedFromProfileId: 'p9',
    templateId: 't1',
  })
  const clean = sanitizeProfileForImport(p)
  assert.equal(clean.directory, undefined)
  assert.equal(clean.bypass, undefined)
  assert.equal(clean.clonedFromProfileId, undefined)
  assert.equal(clean.templateId, undefined)
  assert.equal(clean.name, 'Default')
})
