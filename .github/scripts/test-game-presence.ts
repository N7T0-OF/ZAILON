// Tests unitaires du GamePresenceEngine (GameSessionV2).
// Exécutés par Node 24 (type stripping natif) : aucun framework, aucune dépendance.
//   node --test .github/scripts/test-game-presence.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AUTO_ATTACH_THRESHOLD, presenceRequestFor, shouldScanExternalGame, STEAM_BACKED_ATTACH_THRESHOLD, windowRequestFor } from '../../src/lib/gamePresence.ts'
import { adapterFor, frostyLaunchAdapter, isLauncherBased } from '../../src/lib/launchAdapters.ts'
import type { Game } from '../../src/types.ts'

const game = (name: string, installDirectory?: string): Game => ({
  id: name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  installDirectory,
  installedMods: [],
  profiles: [],
  totalPlaytime: 0,
} as Game)

test('adaptateur NTE expose son AppID Steam (4508340)', () => {
  assert.equal(adapterFor(game('Neverness to Everness')).steamAppId, 4508340)
})

test('adaptateur Frosty : launcher-based, le processus final est NFS16.exe (jamais Frosty)', () => {
  const adapter = frostyLaunchAdapter('C:\\Games\\Need for Speed\\NFS16.exe')
  assert.ok(adapter)
  assert.equal(adapter.launchBehavior, 'ExternalLauncher')
  assert.equal(adapter.launcherExecutable, 'FrostyModManager.exe')
  assert.deepEqual(adapter.gameExecutableCandidates, ['NFS16.exe'])
  assert.deepEqual(adapter.launchChainStages, ['Frosty', 'Plugin', 'Game'])
  assert.equal(isLauncherBased(adapter), true)
  assert.ok(adapter.reattachWindowSeconds >= 120)
})

test('adapterFor : un jeu Frosty (exécutable du registre) est launcher-based', () => {
  const g = game('Need for Speed', 'C:\\Games\\Need for Speed')
  g.execPath = 'C:\\Games\\Need for Speed\\NFS16.exe'
  const adapter = adapterFor(g)
  assert.equal(adapter.launchBehavior, 'ExternalLauncher')
  assert.deepEqual(adapter.gameExecutableCandidates, ['NFS16.exe'])
  assert.equal(isLauncherBased(adapter), true)
})

test('adapterFor : un exécutable non Frosty retombe sur l\'adaptateur par défaut', () => {
  const g = game('Random Game', 'C:\\Games\\Random')
  g.execPath = 'C:\\Games\\Random\\Random.exe'
  const adapter = adapterFor(g)
  assert.equal(adapter.launchBehavior, 'DirectProcess')
  assert.equal(isLauncherBased(adapter), false)
})

test('frostyLaunchAdapter : exécutable hors registre → undefined', () => {
  assert.equal(frostyLaunchAdapter('C:\\Games\\Other\\Other.exe'), undefined)
  assert.equal(frostyLaunchAdapter(undefined), undefined)
})

test('seuil de rattachement automatique fixé à 80', () => {
  assert.equal(AUTO_ATTACH_THRESHOLD, 80)
})

test('pas de scan externe si le jeu n\'est pas installé', () => {
  const g = game('Cyberpunk 2077', undefined)
  assert.equal(shouldScanExternalGame(g, [], [], []), false)
  assert.equal(shouldScanExternalGame(g, [], ['cyberpunk-2077'], []), false)
})

test('pas de scan externe si une session est déjà active', () => {
  const g = game('Cyberpunk 2077', 'C:\\Games\\Cyberpunk 2077')
  assert.equal(shouldScanExternalGame(g, [], [], ['cyberpunk-2077']), false)
})

test('autoAttach activé → scan externe', () => {
  const g = game('Cyberpunk 2077', 'C:\\Games\\Cyberpunk 2077')
  assert.equal(shouldScanExternalGame(g, [], ['cyberpunk-2077'], []), true)
})

test('preuve Steam (AppID actif) → scan externe même sans autoAttach', () => {
  const g = game('Neverness to Everness', 'X:\\Games\\Neverness To Everness')
  assert.equal(shouldScanExternalGame(g, [4508340], [], []), true)
})

test('preuve Steam d\'un autre jeu → pas de scan', () => {
  const g = game('Neverness to Everness', 'X:\\Games\\Neverness To Everness')
  assert.equal(shouldScanExternalGame(g, [1091500], [], []), false)
})

test('la requête de présence embarque la chaîne de l\'adaptateur', () => {
  const g = game('Neverness to Everness', 'X:\\Games\\Neverness To Everness')
  const request = presenceRequestFor(g, true)
  assert.equal(request.gameId, g.id)
  assert.equal(request.installRoot, g.installDirectory)
  assert.equal(request.reattachContext, true)
  assert.ok(request.gameExecutableCandidates.includes('HT-Win64-Shipping.exe'))
  assert.equal(request.launcherExecutable, 'NTELauncher.exe')
})

test('requête de présence : preuve Steam et motif profond NTE (spec UAC §5-6)', () => {
  const g = game('Neverness to Everness', 'X:\\Games\\Neverness To Everness')
  const withoutSteam = presenceRequestFor(g, true)
  assert.equal(withoutSteam.steamRunning, false)
  // Le motif profond du processus final vient de l'adaptateur NTE.
  assert.deepEqual(withoutSteam.gamePathPatterns, ['Client/WindowsNoEditor/HT/Binaries/Win64'])
  const withSteam = presenceRequestFor(g, true, undefined, true)
  assert.equal(withSteam.steamRunning, true)
})

test('seuil Steam-backé : Steam Running abaisse l\'auto-attachement à 60', () => {
  // Spec UAC §5-6, §10 : nom (+25) + contexte (+20) + Steam (+20) = 65 ≥ 60
  // rattache le processus final même si son chemin est inaccessible (élevé).
  assert.equal(STEAM_BACKED_ATTACH_THRESHOLD, 60)
  assert.ok(STEAM_BACKED_ATTACH_THRESHOLD < AUTO_ATTACH_THRESHOLD)
})

test('signatures apprises incluses dans la requête (spec NTE §7 / #36)', () => {
  const g = game('Neverness to Everness', 'X:\\Games\\Neverness To Everness')
  const without = presenceRequestFor(g, true)
  assert.equal(without.learnedSignatures, undefined)
  const withLearned = presenceRequestFor(g, true, [
    { filename: 'HT-Win64-Shipping-2.exe', relativePath: 'Client/WindowsNoEditor/HT/Binaries/Win64/HT-Win64-Shipping-2.exe', publisher: 'NTE Global' },
  ])
  assert.equal(withLearned.learnedSignatures?.length, 1)
  assert.equal(withLearned.learnedSignatures?.[0].filename, 'HT-Win64-Shipping-2.exe')
  assert.ok(withLearned.learnedSignatures?.[0].relativePath?.includes('Win64'))
})

test('requête externe : reattachContext false', () => {
  const g = game('Cyberpunk 2077', 'C:\\Games\\Cyberpunk 2077')
  const request = presenceRequestFor(g, false)
  assert.equal(request.reattachContext, false)
})

test('requête fenêtre : exécutables + contexte, motifs jamais devinés', () => {
  const g = game('Neverness to Everness', 'X:\\Games\\Neverness To Everness')
  const request = windowRequestFor(g, true)
  assert.equal(request.gameId, g.id)
  assert.equal(request.installRoot, g.installDirectory)
  assert.equal(request.reattachContext, true)
  assert.ok(request.gameExecutableCandidates.includes('HT-Win64-Shipping.exe'))
  assert.deepEqual(request.titlePatterns, [])
})

test('requête fenêtre : motifs appris transmis tels quels', () => {
  const g = game('Neverness to Everness', 'X:\\Games\\Neverness To Everness')
  const adapter = { windowTitlePatterns: ['neverness', 'nte'] }
  ;(g as { launchAdapter?: object }).launchAdapter = adapter
  const request = windowRequestFor(g, false)
  assert.deepEqual(request.titlePatterns, ['neverness', 'nte'])
})
