import test from 'node:test'
import assert from 'node:assert/strict'
import { ensurePrincipalInstallation, installationDisplayName, PRINCIPAL_INSTALLATION_ID, resolveGameInstallation } from '../../src/lib/installations.ts'
import { perInstallation } from '../../src/lib/sessionStats.ts'
import type { Game, Profile, TrackedSession } from '../../src/types/index.ts'

const baseGame = (patch: Partial<Game> = {}): Game => ({
  id: 'five-m',
  name: 'FiveM',
  execPath: 'C:\\Games\\FiveM\\FiveM.exe',
  installDirectory: 'C:\\Games\\FiveM',
  installedMods: [],
  profiles: [],
  totalPlaytime: 0,
  ...patch,
})

const profile = (patch: Partial<Profile> = {}): Profile => ({
  id: 'p-drift',
  gameId: 'five-m',
  name: 'Drift',
  modStates: {},
  playtime: 0,
  createdAt: 0,
  ...patch,
})

test('ensurePrincipalInstallation : crée « Principal » depuis execPath (spec §14)', () => {
  const installations = ensurePrincipalInstallation(baseGame())
  assert.equal(installations.length, 1)
  assert.equal(installations[0].id, PRINCIPAL_INSTALLATION_ID)
  assert.equal(installations[0].name, 'Principal')
  assert.equal(installations[0].executablePath, 'C:\\Games\\FiveM\\FiveM.exe')
  assert.equal(installations[0].rootPath, 'C:\\Games\\FiveM')
})

test('ensurePrincipalInstallation : idempotent — jamais de doublon', () => {
  const game = baseGame()
  const first = ensurePrincipalInstallation(game)
  const second = ensurePrincipalInstallation({ ...game, installations: first })
  assert.equal(second.length, 1)
  // Les installations manuelles existantes sont conservées.
  const manual = { id: 'drift', gameId: 'five-m', name: 'Drift', executablePath: 'D:\\FiveM\\FiveM.exe' }
  const withManual = ensurePrincipalInstallation({ ...game, installations: [manual] })
  assert.equal(withManual.length, 2)
  assert.deepEqual(withManual.map(item => item.id).sort(), ['drift', 'principal'])
})

test('ensurePrincipalInstallation : aucun exécutable → aucune installation', () => {
  assert.deepEqual(ensurePrincipalInstallation(baseGame({ execPath: undefined })), [])
})

test('resolveGameInstallation : profile.installationId prioritaire (spec §8-10)', () => {
  const game = baseGame({
    installations: [
      { id: 'principal', gameId: 'five-m', name: 'Principal', executablePath: 'C:\\Games\\FiveM\\FiveM.exe', rootPath: 'C:\\Games\\FiveM' },
      { id: 'drift', gameId: 'five-m', name: 'Drift', executablePath: 'D:\\FiveM\\FiveM.exe', rootPath: 'D:\\FiveM' },
    ],
  })
  const resolved = resolveGameInstallation(game, profile({ installationId: 'drift' }))
  assert.equal(resolved.installation?.id, 'drift')
  assert.equal(resolved.executablePath, 'D:\\FiveM\\FiveM.exe')
  assert.equal(resolved.rootPath, 'D:\\FiveM')
})

test('resolveGameInstallation : fallback « Principal », puis première installation', () => {
  const multi = baseGame({
    installations: [
      { id: 'principal', gameId: 'five-m', name: 'Principal', executablePath: 'C:\\Games\\FiveM\\FiveM.exe', rootPath: 'C:\\Games\\FiveM' },
      { id: 'drift', gameId: 'five-m', name: 'Drift', executablePath: 'D:\\FiveM\\FiveM.exe' },
    ],
  })
  // Profil sans installationId → Principal.
  assert.equal(resolveGameInstallation(multi, profile()).installation?.id, 'principal')
  // Id inconnu → Principal (jamais de référence cassée).
  assert.equal(resolveGameInstallation(multi, profile({ installationId: 'ghost' })).installation?.id, 'principal')
  // Sans « Principal » → première installation.
  const onlyDrift = baseGame({ installations: [{ id: 'drift', gameId: 'five-m', name: 'Drift', executablePath: 'D:\\FiveM\\FiveM.exe' }] })
  assert.equal(resolveGameInstallation(onlyDrift, profile()).installation?.id, 'drift')
})

test('resolveGameInstallation : fallback legacy execPath sans installations', () => {
  const resolved = resolveGameInstallation(baseGame(), profile())
  assert.equal(resolved.installation, undefined)
  assert.equal(resolved.executablePath, 'C:\\Games\\FiveM\\FiveM.exe')
  assert.equal(resolved.rootPath, 'C:\\Games\\FiveM')
})

test('installationDisplayName : nom lisible ou id (spec §61)', () => {
  const game = baseGame({ installations: [{ id: 'drift', gameId: 'five-m', name: 'Drift', executablePath: 'D:\\FiveM\\FiveM.exe' }] })
  assert.equal(installationDisplayName(game, 'drift'), 'Drift')
  assert.equal(installationDisplayName(game, 'ghost'), 'ghost')
  assert.equal(installationDisplayName(game, undefined), undefined)
})

test('perInstallation : regroupe par installation, fallback profil pour legacy (spec §64)', () => {
  const history: TrackedSession[] = [
    { id: '1', gameId: 'five-m', gameName: 'FiveM', profileId: 'a', profileName: 'Default', installationId: 'principal', installationName: 'Principal', startedAt: 0, endedAt: 60_000, durationMin: 60, source: 'zailon' },
    { id: '2', gameId: 'five-m', gameName: 'FiveM', profileId: 'b', profileName: 'Drift', installationId: 'drift', installationName: 'Drift', startedAt: 0, endedAt: 60_000, durationMin: 30, source: 'zailon' },
    { id: '3', gameId: 'five-m', gameName: 'FiveM', profileId: 'c', profileName: 'Legacy', startedAt: 0, endedAt: 60_000, durationMin: 15, source: 'zailon' },
    { id: '4', gameId: 'other', gameName: 'Autre', profileId: 'd', profileName: 'Default', startedAt: 0, endedAt: 60_000, durationMin: 999, source: 'zailon' },
  ]
  const rows = perInstallation(history, 'five-m')
  assert.equal(rows.length, 3)
  assert.equal(rows[0].installationName, 'Principal')
  assert.equal(rows[0].minutes, 60)
  assert.equal(rows[1].installationName, 'Drift')
  assert.equal(rows[1].minutes, 30)
  const legacy = rows.find(row => row.installationName === 'Legacy')
  assert.ok(legacy)
  assert.equal(legacy.minutes, 15)
  assert.equal(legacy.installationId, '')
  // Le total par installation reste inférieur ou égal au total du jeu.
  assert.equal(rows.reduce((sum, row) => sum + row.minutes, 0), 105)
})
